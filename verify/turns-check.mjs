#!/usr/bin/env node
/**
 * turns-check.mjs —— /turns 垫片方案「前置自检」  v2
 *
 * 作用：在一台机器上判断「内存垫片」方案能不能生效，并报告需要的代码特征串是否都在。
 * 特性：不修改、不创建、不删除 gemini-cli 安装目录里的任何东西。
 *       唯一写盘的地方是系统临时目录里的一个自测小例子，跑完立刻删掉。
 *
 * 用法：
 *   node turns-check.mjs                     # 自动定位 gemini-cli
 *   node turns-check.mjs --dir <安装目录>     # 手动指定
 *   node turns-check.mjs --skip-mechanism    # 跳过第 5 步（完全不写任何临时文件）
 *
 * 完整性：输出必须同时出现 START 和 END 两行标志；只出现 START = 脚本被抄漏了。
 *
 * v2 修正：
 *   - 只检查「真正会被加载」的那一套构建（bundle 里有 A/B/C 三套并行副本，
 *     靠从 bundle/gemini.js 顺着 import 关系推导，而不是按文件名猜）
 *   - 机制自测改用文件而非管道收集子进程输出，并把「测不出来」与「测出来不行」区分开
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const START = '[turns-check] ======== START 脚本完整标志 ========';
const END = '[turns-check] ======== END   脚本完整标志 ========';

// 规则与符号的预期数量：用来发现「脚本被抄漏了一段」
const RULES_EXPECTED = 5;
const SYMBOLS_EXPECTED = 19;

const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const skipMechanism = argv.includes('--skip-mechanism');
const explicitDir = argVal('--dir');

let failures = 0;
const say = (tag, msg) => console.log('  [' + tag + '] ' + msg);
const ok = (m) => say('OK  ', m);
const fail = (m) => {
  failures++;
  say('FAIL', m);
};
const warn = (m) => say('WARN', m);
const info = (m) => say('INFO', m);
const head = (m) => console.log('\n' + m);
const count = (hay, needle) => hay.split(needle).length - 1;

// ───────────────────────────────────────────────────────────────
// 规则表：垫片启动时要在内存里做的替换
//   marker = 必须存在的原文片段；loose = 找不到时用来提示的宽松特征
// ───────────────────────────────────────────────────────────────
const RULES = [
  {
    id: 'R1',
    label: '把 turnsCommand 注册进内建命令表',
    marker: '\n      rewindCommand,\n',
    loose: '^\\s+rewindCommand,$',
  },
  {
    id: 'R2',
    label: '注入 /turns 命令与面板代码',
    marker: 'var BuiltinCommandLoader = class {',
    loose: 'BuiltinCommandLoader = class',
  },
  {
    id: 'R3',
    label: '订阅 scroll-to-turn（回合跳转）',
    marker: 'appEvents.on("scroll-to-bottom"',
    loose: 'appEvents\\.on\\("scroll-to-bottom"',
  },
  {
    id: 'R4',
    label: '取消订阅 scroll-to-turn',
    marker: 'appEvents.off("scroll-to-bottom"',
    loose: 'appEvents\\.off\\("scroll-to-bottom"',
  },
  {
    id: 'R5',
    label: '滚动列表支持滚到指定项 scrollToIndex',
    marker: 'scrollToIndex: ({',
    loose: 'scrollToIndex:\\s*\\(\\{',
  },
];

// 注入代码会引用的内部名字，必须存在于 cli chunk 的作用域里
const SYMBOLS = [
  'RewindConfirmation',
  'useRewind',
  'rewindConversation',
  'revertFileChanges',
  'useUIState',
  'useKeyMatchers',
  'BaseSelectionList',
  'partToString',
  'logRewind',
  'RewindEvent',
  'coreEvents',
  'checkExhaustive',
  'debugLogger',
  'getCleanedRewindText',
  'require_react',
  'require_jsx_runtime',
  'useAlternateBuffer',
  'Box_default',
  'theme',
];

const CLI_PROBE = 'var BuiltinCommandLoader = class {';

// ───────────────────────────────────────────────────────────────
// 定位 gemini-cli 安装目录
// ───────────────────────────────────────────────────────────────
function isGeminiInstall(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg && pkg.name === '@google/gemini-cli' ? pkg : null;
  } catch {
    return null;
  }
}

function addCandidate(list, dir) {
  if (!dir) return;
  try {
    const abs = path.resolve(dir);
    if (!list.includes(abs)) list.push(abs);
  } catch {
    /* ignore */
  }
}

function candidates() {
  const list = [];
  addCandidate(list, explicitDir);
  addCandidate(list, process.env.GEMINI_CLI_INSTALL_DIR);

  // 1) npm 全局根
  try {
    const r = spawnSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 20000,
    });
    if (r.status === 0 && r.stdout) {
      addCandidate(list, path.join(r.stdout.trim().split(/\r?\n/)[0], '@google', 'gemini-cli'));
    }
  } catch {
    /* ignore */
  }

  // 2) PATH 里的 gemini（npm 的 cmd/shell 包装通常和 node_modules 同层）
  try {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gemini'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (which.status === 0 && which.stdout) {
      for (const line of which.stdout.trim().split(/\r?\n/)) {
        const p = line.trim();
        if (!p) continue;
        addCandidate(list, path.join(path.dirname(p), 'node_modules', '@google', 'gemini-cli'));
        addCandidate(list, path.join(path.dirname(p), '..', 'node_modules', '@google', 'gemini-cli'));
      }
    }
  } catch {
    /* ignore */
  }

  // 3) 常见固定位置
  if (process.env.APPDATA) addCandidate(list, path.join(process.env.APPDATA, 'npm', 'node_modules', '@google', 'gemini-cli'));
  if (process.env.ProgramFiles) addCandidate(list, path.join(process.env.ProgramFiles, 'nodejs', 'node_modules', '@google', 'gemini-cli'));
  addCandidate(list, path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@google', 'gemini-cli'));
  addCandidate(list, '/usr/local/lib/node_modules/@google/gemini-cli');
  addCandidate(list, '/usr/lib/node_modules/@google/gemini-cli');
  addCandidate(list, path.join(os.homedir(), '.local', 'share', 'pnpm', 'global', '5', 'node_modules', '@google', 'gemini-cli'));
  return list;
}

// ───────────────────────────────────────────────────────────────
// 从入口文件顺着 import 关系推导「真正会被加载」的文件集合
// ───────────────────────────────────────────────────────────────
function reachableSources(entry) {
  const sources = new Map();
  const queue = [entry];
  const importRe = /(?:from|import)\s*\(?\s*["'](\.\/[^"']+\.js)["']/g;
  while (queue.length) {
    const p = queue.shift();
    if (sources.has(p) || !fs.existsSync(p)) continue;
    let src;
    try {
      src = fs.readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    sources.set(p, src);
    for (const m of src.matchAll(importRe)) {
      queue.push(path.resolve(path.dirname(p), m[1]));
    }
  }
  return sources;
}

// ───────────────────────────────────────────────────────────────
// 第 5 步：垫片机制自测（临时目录，跑完删除；用文件而不是管道收输出）
// 返回 'ok' | 'fail' | 'unknown'
// ───────────────────────────────────────────────────────────────
function mechanismTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'turns-check-'));
  try {
    fs.writeFileSync(path.join(tmp, 'target.js'), 'export const v = 1;\n');
    fs.writeFileSync(
      path.join(tmp, 'hook.mjs'),
      [
        'export async function load(url, context, nextLoad) {',
        '  const r = await nextLoad(url, context);',
        "  if (url.includes('target.js')) {",
        "    return { format: 'module', source: r.source.toString().replace('v = 1', 'v = 999'), shortCircuit: true };",
        '  }',
        '  return r;',
        '}',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmp, 'shim.mjs'),
      ["import { register } from 'node:module';", "register(new URL('./hook.mjs', import.meta.url));", ''].join('\n'),
    );
    fs.writeFileSync(path.join(tmp, 'main.mjs'), ["const m = await import('./target.js');", "console.log('v = ' + m.v);", ''].join('\n'));

    const main = path.join(tmp, 'main.mjs');
    const shimUrl = pathToFileURL(path.join(tmp, 'shim.mjs')).href;

    const run = (env) => {
      const outFile = path.join(tmp, 'out-' + Math.random().toString(36).slice(2) + '.txt');
      const fd = fs.openSync(outFile, 'w');
      let res;
      try {
        res = spawnSync(process.execPath, [main], {
          stdio: ['ignore', fd, fd],
          timeout: 30000,
          env: env || process.env,
        });
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
      let text = '';
      try {
        text = fs.readFileSync(outFile, 'utf8');
      } catch {
        /* ignore */
      }
      return { res, text: text.trim() };
    };

    const base = run(process.env);
    const shimmed = run({ ...process.env, NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --import ' + shimUrl).trim() });

    info('不带垫片 -> ' + (base.text || '(无输出)'));
    info('带垫片   -> ' + (shimmed.text || '(无输出)'));

    if (base.res.error || shimmed.res.error) {
      const msg = String((shimmed.res.error || base.res.error).message || 'spawn 失败');
      warn('机制自测未能完成（本机限制，和垫片本身无关）：' + msg);
      warn('这一项判为「未能验证」，不影响其它结论。');
      return 'unknown';
    }
    if (shimmed.text.includes('v = 999')) {
      ok('内存垫片机制可用（加载时改写代码成功）');
      return 'ok';
    }
    fail('内存垫片机制未生效（stderr: ' + ((shimmed.res.stderr || base.res.stderr || '').toString().trim().split('\n')[0] || '空') + '）');
    return 'fail';
  } catch (e) {
    warn('机制自测异常，判为「未能验证」：' + (e && e.message ? e.message : String(e)));
    return 'unknown';
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
      info('临时文件已删除：' + tmp);
    } catch {
      warn('临时目录删除失败（可手动删除）：' + tmp);
    }
  }
}

// ───────────────────────────────────────────────────────────────
// 主流程
// ───────────────────────────────────────────────────────────────
console.log(START);
console.log('[turns-check] v2 · 目的：判断 /turns 垫片能否在这台机器上生效。本脚本只读。');

const problems = [];
if (RULES.length !== RULES_EXPECTED) problems.push('RULES=' + RULES.length + ' 预期 ' + RULES_EXPECTED);
if (SYMBOLS.length !== SYMBOLS_EXPECTED) problems.push('SYMBOLS=' + SYMBOLS.length + ' 预期 ' + SYMBOLS_EXPECTED);

head('[1] 运行环境');
info('Node 版本: ' + process.version);
info('平台: ' + process.platform + ' / ' + process.arch);
info('node 路径: ' + process.execPath);
const nodeMajor = Number(process.versions.node.split('.')[0]);
const nodeMinor = Number(process.versions.node.split('.')[1]);
if (nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 6)) ok('Node 版本满足垫片要求（>= 20.6）');
else fail('Node 版本过低（' + process.version + '），垫片需要 >= 20.6');

head('[2] 定位 gemini-cli 安装');
let install = null;
let pkg = null;
for (const c of candidates()) {
  const p = isGeminiInstall(c);
  if (p) {
    info('找到: ' + c + '  (版本 ' + p.version + ')');
    if (!install) {
      install = c;
      pkg = p;
    }
  }
}
if (!install) {
  fail('没有找到 @google/gemini-cli 安装目录。请用 --dir "<安装目录>" 指定后重跑。');
} else {
  ok('使用安装目录: ' + install + '  (版本 ' + pkg.version + ')');
}

let sources = new Map();
let entry = install ? path.join(install, 'bundle', 'gemini.js') : null;
if (entry && fs.existsSync(entry)) {
  info('入口文件: ' + entry);
  sources = reachableSources(entry);
  const totalMb = (Array.from(sources.values()).reduce((s, t) => s + t.length, 0) / 1048576).toFixed(1);
  info('真正运行的文件: ' + sources.size + ' 个，共 ' + totalMb + ' MB（bundle 里的其它副本是死代码，不参与检查）');
  ok('入口可解析（不是单文件二进制版）');
} else if (install) {
  fail('没有找到 bundle/gemini.js：这台机器可能是单文件二进制版，垫片方案需要单独验证。');
}

const cliChunk = (() => {
  for (const [f, src] of sources) if (src.includes(CLI_PROBE)) return f;
  return null;
})();

head('[3] 规则锚点检查（在真正运行的文件里，每处必须恰好命中 1 次）');
for (const rule of RULES) {
  const hits = [];
  for (const [f, src] of sources) {
    const n = count(src, rule.marker);
    if (n > 0) hits.push(path.basename(f) + ' ×' + n);
  }
  const total = hits.reduce((s, h) => s + Number(h.split('×')[1]), 0);
  if (total === 1) {
    ok(rule.id + ' ' + rule.label + '  ← ' + hits.join(', '));
  } else {
    let hint = '';
    if (total === 0 && rule.loose) {
      const re = new RegExp(rule.loose, 'm');
      for (const [f, src] of sources) {
        if (re.test(src)) hint = '（宽松匹配在 ' + path.basename(f) + ' 里能找到，说明只是写法/缩进不同，可据此重新取锚点）';
      }
    }
    fail(rule.id + ' ' + rule.label + '  ← 命中 ' + total + ' 次' + (hits.length ? ' [' + hits.join(', ') + ']' : '') + ' ' + hint);
  }
}

head('[4] 注入代码依赖的内部名字（必须存在于同一个 chunk 的作用域里）');
if (!cliChunk) {
  fail('找不到含 BuiltinCommandLoader 的 chunk，无法检查内部名字');
} else {
  info('cli chunk = ' + path.basename(cliChunk));
  const src = sources.get(cliChunk);
  let missing = 0;
  for (const sym of SYMBOLS) {
    const n = count(src, sym);
    if (n >= 1) ok(sym + ' ×' + n);
    else {
      missing++;
      fail(sym + ' 不存在');
    }
  }
  if (missing) fail(missing + ' 个内部名字缺失：注入的代码需要按这台机器的实际名字改写');
}

head('[5] 垫片机制自测');
let mechanism = 'skipped';
if (skipMechanism) {
  warn('已按 --skip-mechanism 跳过（未写任何临时文件）');
} else {
  mechanism = mechanismTest();
}

head('[6] 结论');
if (problems.length) {
  fail('脚本自身完整性异常：' + problems.join('；') + ' —— 这份脚本可能被抄漏了，请重新粘贴');
} else {
  ok('脚本自身完整（规则 ' + RULES.length + '/' + RULES_EXPECTED + '，符号 ' + SYMBOLS.length + '/' + SYMBOLS_EXPECTED + '）');
}
if (failures === 0) {
  if (mechanism === 'ok') {
    console.log('\n  >>> 结论：可以在这台机器上使用垫片，且机制已实测通过。请把本输出全部带回。');
  } else if (mechanism === 'unknown') {
    console.log('\n  >>> 结论：锚点与内部名字全部命中，垫片可用；机制那一项因本机限制未能实测（不代表不可用）。');
    console.log('  >>> 实际效果要在启动 gemini 时才能确认。请把本输出全部带回。');
  } else {
    console.log('\n  >>> 结论：锚点与内部名字全部命中，但要靠启动 gemini 做最终确认。请把本输出全部带回。');
  }
} else {
  console.log('\n  >>> 结论：有 ' + failures + ' 项没通过。请把本输出全部带回，不要自己改代码。');
}

console.log(END);
process.exit(failures === 0 ? 0 : 1);
