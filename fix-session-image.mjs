#!/usr/bin/env node
/**
 * fix-session-image.mjs — 从 DSH 会话日志中移除图片内容块（改为文本占位）。
 *
 * 背景：DeepSeek 适配器是纯文本通道，任何图片块都会让整轮运行失败
 * （"The DeepSeek chat-completions adapter does not support image content."），
 * 而图片一旦进入会话历史就会每轮重放、每轮失败。host 没有删除消息的接口，
 * 只能直接改写会话日志（session.jsonl.zstd）。
 *
 * 原理与安全边界：
 *   - 日志 = zstd 校验和帧串联（头帧 + 每批一帧），解码后是 JSONL。
 *   - seq 必须连续（解码后 events[i].seq === i），所以【绝不增删行】，
 *     只把事件 JSON 里的 {type:"image"} 块改写为 {type:"text"} 文本块。
 *   - 保持头行（type:"session"）字节不变；行数与顺序不变。
 *   - 重编码用与后端相同的 Node zlib zstd API + 内容校验和
 *     (ZSTD_c_checksumFlag=1)，帧布局无关（读取是 layout-blind），
 *     统一写成：头帧 + 一个记录帧。
 *   - 行内的 packed 行（text-chunks / reasoning-chunks / tool-call-chunks）
 *     不含图片块，原样保留。
 *
 * 用法：
 *   node fix-session-image.mjs --check            # 只检查，不改文件
 *   node fix-session-image.mjs                    # 备份后原地替换（需先停止 harness！）
 *   node fix-session-image.mjs --out <path>       # 写入指定文件（离线演练用）
 *   node fix-session-image.mjs --scan             # 扫描所有会话里的图片块
 *
 * 重要：必须在 harness 停止状态下执行真正的替换（运行中的 harness 会继续
 * 追加/持有该文件，原地替换会导致丢失尾部事件或损坏日志）。
 */
import { readFileSync, writeFileSync, copyFileSync, statSync, readdirSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, basename } from "node:path";
import { zstdCompressSync, zstdDecompressSync, constants } from "node:zlib";

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const CHECKSUM = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };
const PACKED_ROW_TYPES = new Set(["text-chunks", "reasoning-chunks", "tool-call-chunks"]);

const DEFAULT_SESSION = "session-0d5c3d33-9b1a-4a95-b7a6-09a9f2ea8720";
const DEFAULT_ROOT = join(homedir(), ".dsh", "sessions");

const args = process.argv.slice(2);
const mode = args.includes("--check") ? "check"
	: args.includes("--scan") ? "scan"
	: "apply";
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
const sessionId = args.find((a) => a.startsWith("session-") && !a.startsWith("--")) ?? DEFAULT_SESSION;

function frameRanges(buf) {
	const ranges = [];
	let pos = 0;
	while (pos < buf.length) {
		if (buf.subarray(pos, pos + 4).equals(ZSTD_MAGIC)) {
			const next = buf.indexOf(ZSTD_MAGIC, pos + 4);
			ranges.push({ start: pos, end: next === -1 ? buf.length : next });
			pos = next === -1 ? buf.length : next;
		} else {
			pos += 1;
		}
	}
	return ranges;
}

/** 解码所有完整帧；返回 { lines, torn }（torn=最后一个不完整帧是否被丢弃）。 */
function decodeLog(buf) {
	const ranges = frameRanges(buf);
	const chunks = [];
	let torn = false;
	for (let i = 0; i < ranges.length; i++) {
		const slice = buf.subarray(ranges[i].start, ranges[i].end);
		try {
			chunks.push(zstdDecompressSync(slice));
		} catch (error) {
			if (i === ranges.length - 1) {
				torn = true;
				console.warn(`⚠ 最后一个帧解码失败（撕裂尾部，将被丢弃，与后端行为一致）: ${error.message}`);
			} else {
				throw new Error(`帧 ${i} 解码失败（日志损坏）: ${error.message}`);
			}
		}
	}
	const text = chunks.join("");
	const lines = text.split("\n").filter((l) => l.trim().length > 0);
	return { lines, torn };
}

/** 深度遍历 JSON 值，把 {type:"image"} 块替换为文本块；返回替换数。 */
function stripImageBlocks(node, state) {
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			node[i] = stripImageBlocks(node[i], state);
		}
		return node;
	}
	if (node !== null && typeof node === "object") {
		if (node.type === "image") {
			const attachmentId = node.attachment?.attachmentId ?? "";
			state.count++;
			state.ids.push(attachmentId);
			return {
				type: "text",
				text: attachmentId
					? `(generated image removed from history — original kept in the attachment store: ${attachmentId})`
					: "(image removed from history — the current model does not support image content)"
			};
		}
		for (const key of Object.keys(node)) {
			node[key] = stripImageBlocks(node[key], state);
		}
		return node;
	}
	return node;
}

function locateSessionFile(root, id) {
	for (const project of readdirSync(root)) {
		const projectDir = join(root, project);
		if (!statSync(projectDir).isDirectory()) continue;
		for (const entry of readdirSync(projectDir)) {
			if (entry !== id) continue;
			const p = join(projectDir, entry, "session.jsonl.zstd");
			if (existsSync(p)) return p;
		}
	}
	return undefined;
}

function validate(lines, headerId) {
	// 头行必须是 session 头
	let header;
	try {
		header = JSON.parse(lines[0]);
	} catch {
		throw new Error("头行不是合法 JSON（日志已损坏）");
	}
	if (header.type !== "session") throw new Error(`头行 type 应为 "session"，实际 "${header.type}"`);
	if (header.id !== headerId) throw new Error(`头行 id "${header.id}" 与目标会话 "${headerId}" 不一致`);
	// 普通事件行的 seq 必须严格递增（packed 行跳过）
	let lastSeq = -1;
	for (let i = 1; i < lines.length; i++) {
		let ev;
		try {
			ev = JSON.parse(lines[i]);
		} catch {
			throw new Error(`第 ${i + 1} 行不是合法 JSON`);
		}
		if (ev && typeof ev === "object" && typeof ev.seq === "number") {
			if (ev.seq <= lastSeq) throw new Error(`seq 不连续：第 ${i + 1} 行 seq=${ev.seq}，上一普通事件 seq=${lastSeq}`);
			lastSeq = ev.seq;
		}
	}
	return header;
}

function encodeLog(lines) {
	const headerLine = lines[0] + "\n";
	const recordText = lines.slice(1).join("\n") + "\n";
	return Buffer.concat([
		zstdCompressSync(Buffer.from(headerLine, "utf8"), CHECKSUM),
		zstdCompressSync(Buffer.from(recordText, "utf8"), CHECKSUM)
	]);
}

function processFile(path, id) {
	const original = readFileSync(path);
	const { lines, torn } = decodeLog(original);
	const header = validate(lines, id);
	console.log(`会话 ${id}: ${lines.length} 行（含 packed 行）${torn ? "，含撕裂尾帧" : ""}，头行 ${header.type}/${header.id}`);

	const state = { count: 0, ids: [] };
	for (let i = 1; i < lines.length; i++) {
		let ev;
		try {
			ev = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		if (ev === null || typeof ev !== "object") continue;
		if (PACKED_ROW_TYPES.has(ev.type)) continue; // packed 行只含文本 delta，原样保留
		const before = JSON.stringify(ev);
		stripImageBlocks(ev, state);
		const after = JSON.stringify(ev);
		if (before !== after) lines[i] = after;
	}
	return { lines, header, edited: state };
}

// ---- scan 模式：列出所有会话里的图片块 ----
if (mode === "scan") {
	for (const project of readdirSync(DEFAULT_ROOT)) {
		const projectDir = join(DEFAULT_ROOT, project);
		if (!statSync(projectDir).isDirectory()) continue;
		for (const entry of readdirSync(projectDir)) {
			if (!entry.startsWith("session-")) continue;
			const p = join(projectDir, entry, "session.jsonl.zstd");
			if (!existsSync(p)) continue;
			try {
				const { lines } = decodeLog(readFileSync(p));
				let hits = 0;
				for (let i = 1; i < lines.length; i++) {
					try {
						const ev = JSON.parse(lines[i]);
						if (PACKED_ROW_TYPES.has(ev.type)) continue;
						const s = JSON.stringify(ev);
						if (s.includes('"type":"image"')) hits++;
					} catch {}
				}
				if (hits > 0) console.log(`${entry}: ${hits} 个含图片块的事件`);
			} catch (error) {
				console.error(`${entry}: 读取失败 — ${error.message}`);
			}
		}
	}
	console.log("扫描完成。");
	process.exit(0);
}

// ---- 定位会话文件 ----
const path = locateSessionFile(DEFAULT_ROOT, sessionId);
if (path === undefined) {
	console.error(`未找到会话 ${sessionId} 的日志文件（root=${DEFAULT_ROOT}）`);
	process.exit(1);
}
console.log(`日志文件: ${path}`);
const originalBytes = readFileSync(path);

const { lines, edited } = processFile(path, sessionId);

if (edited.count === 0) {
	console.log("没有发现图片块，文件无需修改。");
	process.exit(0);
}
console.log(`发现 ${edited.count} 个图片块，attachmentId: ${edited.ids.filter(Boolean).join(", ") || "(无)"}`);

if (mode === "check") {
	console.log("--check 模式：未修改文件。");
	process.exit(0);
}

const target = outPath ?? path;
const encoded = encodeLog(lines);

// ---- 写前自检：重解码写入结果 ----
const probe = decodeLog(encoded);
validate(probe.lines, sessionId);
const probeState = { count: 0, ids: [] };
for (let i = 1; i < probe.lines.length; i++) {
	try {
		const ev = JSON.parse(probe.lines[i]);
		if (PACKED_ROW_TYPES.has(ev.type)) continue;
		stripImageBlocks(ev, probeState);
	} catch {}
}
if (probeState.count !== 0) throw new Error("写前自检失败：重编码后仍含图片块");
if (probe.lines.length !== lines.length) throw new Error(`写前自检失败：行数变化 ${lines.length} → ${probe.lines.length}`);

if (outPath !== undefined) {
	writeFileSync(outPath, encoded);
	console.log(`已写入演练文件: ${outPath}（${encoded.length} 字节，原 ${statSync(path).size} 字节）`);
	console.log("→ 请先离线验证该文件能被 harness 的 loader 接受，再执行正式替换。");
	process.exit(0);
}

// ---- 正式替换（需 harness 已停止！）----
// 防并发守卫：处理期间文件若被改动（说明 harness 还在写），立即中止。
const liveNow = readFileSync(path);
if (!liveNow.equals(originalBytes)) {
	console.error("✗ 中止：处理期间日志文件发生了变化（harness 可能仍在运行并写入）。");
	console.error("  请先完全停止 harness，再重新运行本脚本。");
	process.exit(1);
}
const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(path, backup);
console.log(`已备份原日志: ${backup}`);
const tmp = join(dirname(path), `.${basename(path)}.fix-${process.pid}`);
writeFileSync(tmp, encoded);
renameSync(tmp, path);
console.log(`已替换日志: ${path}`);
console.log(`替换完成：${edited.count} 个图片块已改为文本占位。重启 harness 后会话即可正常继续。`);
