# 任务：给 gemini-cli 添加一个 `/turns` 命令

你是一名 Windows 上的工程师。请在**本机**为 gemini-cli 增加一个新命令 `/turns`，并让它工作起来。
下面第一部分是需求（我要的效果），第二部分是硬规则，第三部分是行动指南，第四部分是回报要求。
严格按阶段执行，不要跳步，不要"顺手优化"。

---

# 一、需求

gemini-cli 目前有一个内置命令 `/rewind`：它列出一段段历史让你选，然后回滚。它有两个问题：

1. 它列出来的东西**不全是"我真正问过的问题"**——里面混着一些没有正文的记录（工具执行结果），
   选中它们会从对话中间切断，而我在屏幕上根本看不到对应的内容。
2. 它**只能回滚**，不能"只是跳到某一回合去看一眼"。

我要你加一个新命令 `/turns`，行为如下：

**1) 列表**
输入 `/turns` 后弹出一个面板，把我**每一次真实的提问**作为一个"回合"，一行一个地列出来：

- 序号，形如 `3/12`
- 我当时问的内容（太长就截断）
- 如果那一回合改过文件，显示类似 `2 个文件改动 +30 -12`；没改过就显示「没有文件改动」
- 键盘：↑↓ 选择，Enter 确定，Esc 退出

**2) 选中一个回合之后，给出三个动作**

- **只看这一回合** —— 把聊天区滚动到那一回合的位置，**不改任何内容**
- **回滚到这一回合之前…** —— 弹出和 `/rewind` **一模一样**的确认框（见下一条）
- **返回列表**

**3) 那个确认框必须是 `/rewind` 现有的那 4 个选项，一个字都不能改**

- `Rewind conversation and revert code changes`
- `Rewind conversation`
- `Revert code changes`
- `Do nothing (esc)`

（当所选回合之后没有任何文件改动时，现有逻辑会自动只留下后两项——这个行为保持不变，不要自己实现。）

**4) 边界要求**

- **绝对不许修改 `/rewind` 本身的行为**。它是另一个命令，保持原样。
- 「只看这一回合」这个动作**不记任何遥测**；只有真正回滚时才记（与 `/rewind` 一致）。
- 回滚的语义必须和 `/rewind` 一致：**连你选中的那一次提问一起删掉**，并把它的原话放回输入框。

**5) 什么叫"真实的提问"（决定一行算不算一个回合）**

内容非空、不是以 `/` 开头、不是以 `?` 开头、不是以 `<session_context>` 或 `<hook_context>` 开头。
其余一律不算一个回合。（这条很重要：只有按这个口径筛，面板里的序号才能和聊天区里的位置对齐。）

**6) 关于"画布模式"**

gemini-cli 有一个设置项 `Use Alternate Screen Buffer`（在 `/settings` 的 UI 分类里），
还有一个 `Terminal Buffer`。**只有这两个开着的时候**，程序才有能力把聊天区滚动到之前的位置。

- 开着时：`只看这一回合` 这个动作正常提供
- 没开时：**不显示这个动作**，并在面板底部提示用户去 `/settings` 打开它（打开后需要重启）

---

# 二、硬规则（违反即任务失败）

- 这台机器是 **Windows**。命令用 cmd 语法；如果你用 PowerShell 执行，注意 `%VAR%` **不会展开**，要写成 `$env:VAR`
- **只允许改两个文件**：
  1. `bundle` 目录里那个 3~4 MB 的 chunk —— 定义 `/rewind` 命令的那个
  2. 那个 1~2 MB 的 interactiveCli chunk —— 定义聊天区滚动列表的那个
- 其它文件**一个字都不许动**。不许 `npm install` / `npm update` / 重装 / 升级。不许动 `.gemini` 目录
- 改之前**先备份**：把要改的文件复制一份，文件名后面加 `.turns-backup`
- **任何一步"搜不到"或"搜到不止一处"，立刻停止**：不要猜、不要改名、不要换个地方硬塞。
  把你实际搜到什么原样贴出来，然后结束任务
- 不要重排代码、不要重新格式化、不要"顺手优化"。我给你的代码**原样**插入

---

# 三、行动指南

## 阶段一：只读侦察（**这一阶段不许修改任何文件**）

1. 找出 gemini-cli 的安装目录，报告它的版本号（读它的 `package.json`）
2. 报告 `bundle` 目录下所有 `.js` 文件的名字和大小，并指出哪两个分别是 3~4 MB 和 1~2 MB
3. 打开 `bundle/gemini.js`，把它 `import` 的文件名**全部**列出来。
   （这一步是为了确定"真正运行"的是哪一套——bundle 里存在好几套内容重复的副本，
   只有真正被 import 的那一套才会被执行，改其它副本没有任何效果）
4. 在"真正运行"的那批文件里，逐个搜索下面 6 个特征，报告**每个特征出现在哪个文件、几次**，
   并把每一处的**前后 3 行原文**贴出来（原样，不要改写、不要省略、不要加注释）：

   - `rewindCommand`
   - `BuiltinCommandLoader`
   - `appEvents.on("scroll-to-bottom"`
   - `appEvents.off("scroll-to-bottom"`
   - `scrollToIndex`
   - `RewindConfirmation`
5. 报告下面这些名字，各自**在同一个文件里**出现几次（出现 0 次也要明确写 0）：

   `RewindConfirmation` `useRewind` `rewindConversation` `revertFileChanges`
   `getCleanedRewindText` `logRewind` `RewindEvent` `coreEvents` `checkExhaustive`
   `useKeyMatchers` `useKeypress` `useUIState` `useAlternateBuffer`
   `BaseSelectionList` `RadioButtonSelect` `Box_default` `Text` `theme`
   `appEvents` `require_react` `require_jsx_runtime`
6. **停在这里**，把 1~5 的结果贴出来。

**判据**：只要第 5 步里有任何一个名字是 0 次，或者第 4 步里有任何一处找不到，
就结束任务，**不要进入阶段二**——把报告贴出来即可。

## 阶段二：三处改动（仅在阶段一全部通过之后才做）

### 改动 1 —— 插入 `/turns` 的实现

在定义 `/rewind` 命令的那个文件里，找到命令加载器类的定义（名字里含 `BuiltinCommandLoader`）。
把下面整段代码**原样**插到它**前面**。一个字符都不要改、不要重排、不要重新格式化：

```js
// ===== turns-inject BEGIN =====
// /turns —— 在会话回合之间跳转，并以与 /rewind 完全相同的 4 选项确认框执行回滚。
//
// 插入位置：CLI 的 chunk 里、内建命令加载器（BuiltinCommandLoader）那个类的定义之前。
// 之所以必须在那之前：下面引用的名字（RewindConfirmation / useRewind /
// rewindConversation / revertFileChanges / getCleanedRewindText / BaseSelectionList /
// RadioButtonSelect / useKeypress / useAlternateBuffer 等）都在它之前定义。
//
// 依赖的模块作用域名字：
//   require_react / require_jsx_runtime / appEvents / Box_default / Text / theme
//   RewindConfirmation / useRewind / rewindConversation / revertFileChanges
//   getCleanedRewindText / logRewind / RewindEvent / coreEvents / checkExhaustive
//   useKeyMatchers / useKeypress / useUIState / useAlternateBuffer
//   BaseSelectionList / RadioButtonSelect
// 任何一个都【不要改名】。搜不到就停下来报告，不要自己发明替代。

var TURNS_SCROLL_EVENT = "scroll-to-turn";

function turnsMessageText(msg) {
  var parts = Array.isArray(msg && msg.content)
    ? msg.content
    : msg && msg.content != null
      ? [msg.content]
      : [];
  var text = "";
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    text += typeof p === "string" ? p : (p && p.text) || "";
  }
  return text.trim();
}

// 一个「回合」= 一次真实的用户输入。
// 排除：空内容、斜杠/问号命令、以及只带环境头/<hook_context> 的合成记录。
// （这些在聊天区里也看不见，所以排除它们才能让序号和聊天区对齐。）
function turnsIsRealTurn(msg) {
  if (!msg || msg.type !== "user") return false;
  var t = turnsMessageText(msg);
  if (!t) return false;
  if (t.charAt(0) === "/" || t.charAt(0) === "?") return false;
  if (t.indexOf("<session_context>") === 0 || t.indexOf("<hook_context>") === 0) return false;
  return true;
}

function turnsNorm(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

function TurnsDialog(props) {
  var React = require_react();
  var rt = require_jsx_runtime();
  var jsx = rt.jsx;
  var jsxs = rt.jsxs;

  var conversation = props.conversation;
  var onExit = props.onExit;
  var onApply = props.onApply;

  var keyMatchers = useKeyMatchers();
  var uiState = useUIState();
  var canvasMode = useAlternateBuffer();
  var rewind = useRewind(conversation);

  var turns = React.useMemo(
    function () {
      var msgs = (conversation && conversation.messages) || [];
      var out = [];
      for (var i = 0; i < msgs.length; i++) {
        if (turnsIsRealTurn(msgs[i])) out.push(msgs[i]);
      }
      return out;
    },
    [conversation],
  );

  var st0 = React.useState("list");
  var screen = st0[0];
  var setScreen = st0[1];
  var st1 = React.useState(-1);
  var turnIndex = st1[0];
  var setTurnIndex = st1[1];
  var st2 = React.useState("");
  var notice = st2[0];
  var setNotice = st2[1];

  useKeypress(
    function (key) {
      if (keyMatchers["basic.cancel" /* ESCAPE */](key)) {
        if (screen === "list") {
          onExit();
        } else {
          setScreen("list");
        }
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  var openTurn = function (index) {
    setTurnIndex(index);
    setScreen("action");
  };

  var openConfirm = function (index) {
    var msg = turns[index];
    if (!msg) return;
    rewind.selectMessage(msg.id);
    setScreen("confirm");
  };

  var doJump = function (index) {
    var msg = turns[index];
    var history = (uiState && uiState.history) || [];
    var seen = -1;
    var uiIndex = -1;
    for (var i = 0; i < history.length; i++) {
      if (history[i] && history[i].type === "user") {
        seen++;
        if (seen === index) {
          uiIndex = i;
          break;
        }
      }
    }
    if (uiIndex < 0) {
      setNotice("在聊天记录里找不到这一回合（历史可能被压缩或截断过），因此没有跳转。");
      setScreen("notice");
      return;
    }
    var a = turnsNorm(history[uiIndex].text).slice(0, 40);
    var b = turnsNorm(turnsMessageText(msg)).slice(0, 40);
    if (a && b && a !== b) {
      setNotice("记录里的回合与聊天区对不上位置。为避免跳错，本次不跳转。");
      setScreen("notice");
      return;
    }
    onExit();
    setTimeout(function () {
      appEvents.emit(TURNS_SCROLL_EVENT, uiIndex + 1);
    }, 0);
  };

  var terminalWidth = (uiState && uiState.terminalWidth) || 80;
  var canvasHint = jsx(Text, {
    color: theme.text.secondary,
    children: "提示：跳转需要画布模式（/settings → UI → Use Alternate Screen Buffer），改完需重启。",
  });

  if (!turns.length) {
    return jsx(Box_default, {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.border.default,
      padding: 1,
      children: jsx(Text, { children: "没有可以导航的回合。" }),
    });
  }

  if (screen === "notice") {
    return jsxs(Box_default, {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.border.default,
      padding: 1,
      width: terminalWidth,
      children: [
        jsx(Text, { bold: true, children: "没有跳转" }),
        jsx(Text, { children: notice }),
        jsx(Text, { color: theme.text.secondary, children: "按 Esc 返回列表。" }),
      ],
    });
  }

  if (screen === "confirm") {
    var confirmMsg = turns[turnIndex];
    return jsx(RewindConfirmation, {
      stats: rewind.confirmationStats,
      terminalWidth: terminalWidth,
      timestamp: confirmMsg && confirmMsg.timestamp,
      onConfirm: function (outcome) {
        if (outcome === "cancel" /* Cancel */) {
          rewind.clearSelection();
          setScreen("list");
          return;
        }
        if (!confirmMsg) return;
        var newText = getCleanedRewindText(confirmMsg);
        var messageId = confirmMsg.id;
        void (async function () {
          await onApply(messageId, newText, outcome);
        })();
      },
    });
  }

  if (screen === "action") {
    var actionItems = [];
    if (canvasMode) {
      actionItems.push({
        key: "jump",
        value: "jump",
        label: "只看这一回合（把聊天区滚过去，不改任何内容）",
      });
    }
    actionItems.push({
      key: "rewind",
      value: "rewind",
      label: "回滚到这一回合之前…（和 /rewind 相同的确认框）",
    });
    actionItems.push({ key: "back", value: "back", label: "返回列表" });
    return jsxs(Box_default, {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.border.default,
      padding: 1,
      width: terminalWidth,
      children: [
        jsx(Text, {
          bold: true,
          children: "第 " + (turnIndex + 1) + " / " + turns.length + " 个回合",
        }),
        jsx(Text, {
          color: theme.text.secondary,
          children: turnsNorm(turnsMessageText(turns[turnIndex])).slice(0, 200),
        }),
        jsx(Text, { children: "选择动作：" }),
        jsx(RadioButtonSelect, {
          items: actionItems,
          isFocused: true,
          onSelect: function (value) {
            if (value === "jump") doJump(turnIndex);
            else if (value === "rewind") openConfirm(turnIndex);
            else setScreen("list");
          },
        }),
        !canvasMode && canvasHint,
      ],
    });
  }

  var listItems = turns.map(function (msg, index) {
    return { key: String(msg.id || index), value: msg, index: index };
  });

  return jsxs(Box_default, {
    flexDirection: "column",
    borderStyle: "round",
    borderColor: theme.border.default,
    padding: 1,
    width: terminalWidth,
    children: [
      jsx(Text, { bold: true, children: "Turns —— 选一个回合" }),
      jsx(BaseSelectionList, {
        items: listItems,
        initialIndex: listItems.length - 1,
        isFocused: true,
        showNumbers: true,
        wrapAround: false,
        maxItemsToShow: 10,
        onSelect: function (msg) {
          var idx = turns.indexOf(msg);
          if (idx >= 0) openTurn(idx);
        },
        renderItem: function (wrapper, opts) {
          var msg = wrapper.value;
          var idx = turns.indexOf(msg);
          var stats = rewind.getStats(msg);
          var selected = !!(opts && opts.isSelected);
          var rows = [
            jsx(Text, {
              color: selected ? theme.status.success : theme.text.primary,
              children:
                idx + 1 + "/" + turns.length + "  " + turnsNorm(turnsMessageText(msg)).slice(0, 120),
            }),
          ];
          rows.push(
            stats
              ? jsx(Text, {
                  color: theme.text.secondary,
                  children:
                    stats.fileCount +
                    " 个文件改动 +" +
                    stats.addedLines +
                    " -" +
                    stats.removedLines,
                })
              : jsx(Text, { color: theme.text.secondary, children: "没有文件改动" }),
          );
          return jsxs(Box_default, { flexDirection: "column", children: rows });
        },
      }),
      jsx(Text, { color: theme.text.secondary, children: "↑↓ 选择，Enter 确定，Esc 退出" }),
      !canvasMode && canvasHint,
    ],
  });
}

var turnsCommand = {
  name: "turns",
  description: "在会话回合之间跳转，并可回滚到某个回合（选项与 /rewind 相同）",
  kind: "built-in" /* BUILT_IN */,
  action: function (context) {
    var agentContext = context.services.agentContext;
    var config = agentContext && agentContext.config;
    if (!config) {
      return { type: "message", messageType: "error", content: "Config not found" };
    }
    var client = agentContext.geminiClient;
    if (!client) {
      return { type: "message", messageType: "error", content: "Client not initialized" };
    }
    var recordingService = client.getChatRecordingService();
    if (!recordingService) {
      return { type: "message", messageType: "error", content: "Recording service unavailable" };
    }
    var conversation = recordingService.getConversation();
    if (!conversation) {
      return { type: "message", messageType: "info", content: "No conversation found." };
    }
    var hasTurn = false;
    for (var i = 0; i < conversation.messages.length; i++) {
      if (turnsIsRealTurn(conversation.messages[i])) {
        hasTurn = true;
        break;
      }
    }
    if (!hasTurn) {
      return { type: "message", messageType: "info", content: "没有可以导航的回合。" };
    }
    var rt = require_jsx_runtime();
    return {
      type: "custom_dialog",
      component: rt.jsx(TurnsDialog, {
        conversation: conversation,
        onExit: function () {
          context.ui.removeComponent();
        },
        onApply: async function (messageId, newText, outcome) {
          if (outcome !== "cancel" /* Cancel */) {
            logRewind(config, new RewindEvent(outcome));
          }
          switch (outcome) {
            case "cancel" /* Cancel */:
              context.ui.removeComponent();
              return;
            case "revert_only" /* RevertOnly */:
              await revertFileChanges(conversation, messageId);
              context.ui.removeComponent();
              coreEvents.emitFeedback("info", "File changes reverted.");
              return;
            case "rewind_and_revert" /* RewindAndRevert */:
              await revertFileChanges(conversation, messageId);
              await rewindConversation(context, client, recordingService, messageId, newText);
              return;
            case "rewind_only" /* RewindOnly */:
              await rewindConversation(context, client, recordingService, messageId, newText);
              return;
            default:
              checkExhaustive(outcome);
          }
        },
      }),
    };
  },
};
// ===== turns-inject END =====
```

### 改动 2 —— 把新命令登记进命令表

在**同一个文件**里，找到把 `/rewind` 登记进命令表的那一行。
特征是：整行只有一个 `rewindCommand,`，它的上下是别的命令名。
在它**下面紧挨着**加一行：

```
turnsCommand,
```

缩进必须和上一行**完全一致**。

### 改动 3 —— 让聊天区能滚到指定回合（在 interactiveCli 那个文件里）

找到订阅 `scroll-to-bottom` 的这段代码：

```js
    const handleScroll = () => {
      scrollableListRef.current?.scrollToEnd();
    };
```

在它**后面**插入：

```js
    const handleTurn = (index) => {
      if (typeof index === "number") scrollableListRef.current?.scrollToIndex({ index, viewPosition: 0 });
    };
```

然后在同一段里找到这一行（它订阅 `scroll-to-bottom`）：

`appEvents.on("scroll-to-bottom" ...`

在它下面加一行：

```js
    appEvents.on("scroll-to-turn", handleTurn);
```

再找到这一行（它取消订阅 `scroll-to-bottom`）：

`appEvents.off("scroll-to-bottom" ...`

在它下面加一行：

```js
      appEvents.off("scroll-to-turn", handleTurn);
```

注意：`on` 那行的缩进是 4 个空格，`off` 那行的缩进是 6 个空格，照抄，不要改。

## 阶段三：验收（做完必须逐条报告）

1. 报告两个被改文件的大小变化（改前 -> 改后）
2. 在这两个文件里搜索并报告出现次数，每项都应该是 1：

   - `turns-inject BEGIN`
   - `turnsCommand,`
   - `appEvents.on("scroll-to-turn"`
   - `appEvents.off("scroll-to-turn"`
   - `const handleTurn = (index) =>`
3. 对改过的两个文件各跑一次语法检查，把结果贴出来（没有任何输出 = 通过）：

   ```
   node --check "<改过的文件的完整路径>"
   ```
4. 重启 gemini，输入 `/turns`，把你看到的面板内容描述出来

## 退回方法（如果搞坏了）

把带 `.turns-backup` 的备份文件改回原来的文件名，覆盖回去即可。
**不要删除备份文件。**

---

# 四、你要回报什么

1. **阶段一的完整报告**（原样贴，不要总结）
2. 阶段三的每一项输出
3. 如果中途停下，说明停在哪一步、你实际搜到了什么

**最重要的一条**：如果阶段一就发现问题（某个名字是 0 次、某个特征找不到），
**停下来回报，不要尝试自己想办法绕过。** 报告本身就是我需要的结果。

---

# 附：如果需要独立核对改动是否到位

如果任务目录里有 `turns-apply.mjs` 和 `turns-inject.js`，可以跑：

```
node turns-apply.mjs --dir "<gemini-cli 安装目录>" --verify-applied
```

这个命令**只看"标记在不在"**，不依赖任何锚点，所以即使在你这版代码上锚点对不上，
它也能正确判断改动有没有到位。期望结果：E1~E5 五行都显示 `[已应用]`，
最后一句是「5 处改动都已存在，改动是完整的」。
