<p>
    <a href="https://github.com/composiohq/composio/blob/master/README.md">英語</a> | <a
        href="https://github.com/composiohq/composio/blob/master/README-CN.md">中国語</a> | <a
        href="https://github.com/composiohq/composio/blob/master/README-JP.md">日本語</a>
</p>
<p align="center">
    <a href="https://composio.dev//#gh-dark-mode-only">
        <img src="./python/docs/imgs/composio_white_font.svg" width="318px" alt="Composio ロゴ" />
    </a>
    <a href="https://composio.dev//#gh-light-mode-only">
        <img src="./python/docs/imgs/composio_black_font.svg" width="318px" alt="Composio ロゴ" />
    </a>
</p>
<p align="center">
    <a href="https://docs.composio.dev">
        <img src="https://img.shields.io/badge/Read%20the%20Documentation-Click%20Here-green?style=for-the-badge&logo=read-the-docs"
            alt="ドキュメントを読む">
    </a>
</p>

<p align="center">
    <a href="https://pypi.org/project/composio-core/">
        <img alt="PyPI"
            src="https://img.shields.io/pypi/v/composio_core?label=Latest&style=plastic&logo=pypi&color=blue&cacheSeconds=60&logoColor=white">
    </a>
    <a href="https://www.npmjs.com/package/composio-core">
        <img alt="NPM"
            src="https://img.shields.io/npm/v/composio-core?style=plastic&logo=npm&logoColor=white&label=latest&color=blue&cacheSeconds=60">
    </a>
    <a href="https://pypi.org/project/composio-core/">
        <img alt="ダウンロード"
            src="https://img.shields.io/pypi/dm/composio-core?label=Downloads&style=plastic&logo=github&color=blue&cacheSeconds=60">
    </a>
</p>

<h2 align="center">
    AI エージェント向けの製品版ツールセット
</h2>

<img alt="イラスト" src="./python/docs/imgs/banner.gif" style="border-radius: 5px" />

<h2> Composio?</h2>
<p><strong>Composio は AI エージェント向けの製品化対応ツールセットを提供します</strong>。以下を提供します:</p>
<ul>
    <li>複数のカテゴリにわたる 250 以上のツールのサポート:
        <ul>
            <li>GitHub、Notion、Linear、Gmail、Slack、Hubspot、Salesforce などのソフトウェア ツール &
                <a href="https://app.composio.dev/apps">
                    その他
                </a>
            </li>
            <li>ファイル ツール、シェル ツール、コード分析ツールなどの OS 操作 &
                <a href="https://app.composio.dev/apps">
                    その他
                </a>
            </li>
            <li>Google、Perplexity、Tavily、Exa による検索機能 &
                <a href="https://app.composio.dev/apps">
                    その他
                </a>
            </li>
        </ul>
    </li>
    <li>OpenAI、Groq、 Claude、LlamaIndex、Langchain、CrewAI、Autogen、Gemini、
        および <a href="https://docs.composio.dev/framework">その他</a></li>
    <li>複数のプロトコル (OAuth、API キー、Basic JWT) をサポートするマネージド認証</li>
    <li>最適化された設計により、ツール呼び出しの精度が最大 40% 向上</li>
    <li>バックエンド統合のためのホワイトラベル ソリューション</li>
    <li>カスタム ツールと拡張機能をサポートするプラグ可能なアーキテクチャ</li>
</ul>

## 📋 目次

- [Python の使用開始](#python-を使い始める)
    - [1. インストール](#1-インストール)
    - [2. エージェントの作成とツールの実行](#2-エージェントの作成とツールの実行)
- [JavaScript の使用開始](#javascript-を使い始める)
    - [1. インストール](#1-インストール-1 )
    - [2.エージェントの作成とツールの実行](#2-エージェントの作成とツールの実行-1)
- [例](#例)
    - [Python の例](#python-の例)
    - [JavaScript の例](#javascript-の例)
- [スター履歴](#星の履歴)
- [ヘルプの取得](#ヘルプの取得)
- [貢献](#貢献)
- [機能のリクエスト](#機能のリクエスト)
- [すべての貢献者に感謝](#すべての貢献者に感謝)


## Python を使い始める

### 1. インストール

まずパッケージをインストールします

```bash
pip install composio-core
```

'composio' パッケージをその openai プラグインとともにインストールする場合は、`pip install composio-openai` を実行します。

### 2. エージェントの作成とツールの実行

OpenAI を使用して AI エージェントを作成し、Composio の GitHub ツールを使用して GitHub リポジトリにスターを付けましょう

> [!NOTE]
> 環境変数に COMPOSIO_API_KEY と OPENAI_API_KEY を設定します。

GitHubアカウントをComposioに接続する
```bash
composio add github # ターミナルでこれを実行する
```

```python
from openai import OpenAI
from composio_openai import ComposioToolSet, App, Action

openai_client = OpenAI(api_key="{{OPENAIKEY}}")

# Composioツールセットを初期化する

composio_tool_set = ComposioToolSet()

# 事前設定されたGitHubツールを入手する
actions = composio_tool_set.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

my_task = "Star a repo composiodev/composio on GitHub"

# Openaiアシスタントのセットアップ
assistant_instruction = "You are a super intelligent personal assistant"

assistant = openai_client.beta.assistants.create(
    name="Personal Assistant",
    instructions=assistant_instruction,
    model="gpt-4-turbo",
    tools=actions,
)

# スレッドを作成する
thread = openai_client.beta.threads.create()

message = openai_client.beta.threads.messages.create(
    thread_id=thread.id, role="user", content=my_task
)

# 統合されたエージェントの実行
run = openai_client.beta.threads.runs.create(
    thread_id=thread.id, assistant_id=assistant.id
)


# 関数呼び出しを実行する
response_after_tool_calls = composio_tool_set.wait_and_handle_assistant_tool_calls(
    client=openai_client,
    run=run,
    thread=thread,
)

print(response_after_tool_calls)
```

## JavaScript を使い始める

JavaScript で Composio SDK を使い始めるには、次の手順に従います:

### 1. インストール:
```bash
npm install composio-core
```

### 2. エージェントの作成とツールの実行

OpenAI を使用して AI エージェントを作成し、Composio の GitHub ツールを使用して GitHub リポジトリにスターを付けましょう

> [!NOTE]
> 環境変数に COMPOSIO_API_KEY と OPENAI_API_KEY を設定します。

GitHubアカウントをComposioに接続する
```bash
composio add github # ターミナルでこれを実行する
```

```javascript
import { OpenAIToolSet } from "composio-core";
import OpenAI from "openai";

const toolset = new OpenAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools = await toolset.getTools({ actions: ["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"] });

async function createGithubAssistant(openai, tools) {
    return await openai.beta.assistants.create({
        name: "Github Assistant",
        instructions: "You're a GitHub Assistant, you can do operations on GitHub",
        tools: tools,
        model: "gpt-4o"
    });
}

async function executeAssistantTask(openai, toolset, assistant, task) {
    const thread = await openai.beta.threads.create();
    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
        instructions: task,
        tools: tools,
        model: "gpt-4o",
        stream: false
    });
    const call = await toolset.waitAndHandleAssistantToolCalls(openai, run, thread);
    console.log(call);
}

(async () => {
    const githubAssistant = await createGithubAssistant(openai, tools);
    await executeAssistantTask(
        openai,
        toolset,
        githubAssistant,
        "Star the repository 'composiohq/composio'"
    );
})();
```

## 例

### [Python の例](https://docs.composio.dev/guides/python/)

### [JavaScript の例](https://docs.composio.dev/guides/javascript/)

## 星の履歴

[![星の履歴
チャート](https://api.star-history.com/svg?repos=composiohq/composio&type=Date)](https://star-history.com/#composiohq/composio&Date)

## ヘルプの取得

- <a href="https://docs.composio.dev" target="_blank" rel="noopener noreferrer">docs.composio.dev</a> でドキュメントを読む
- <a href="https://discord.com/channels/1170785031560646836/1268871288156323901" target="_blank"
    rel="noopener noreferrer">discord</a>

## 貢献

私たちはオープンソース プロジェクトであり、貢献を歓迎しています。詳細については、<a href="https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md"
    target="_blank" rel="noopener noreferrer">貢献ガイド</a>をお読みになり、開始する前に、<a
    href="https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md" target="_blank"
    rel="noopener noreferrer">行動規範</a>を確認してください。

## 機能のリクエスト

- 機能のリクエストがある場合は、<a
    href="https://github.com/composiodev/composio/issues/new?assignees=&labels=feature&template=feature_request.yml&title=%F0%9F%9A%80+Feature%3A+">問題</a>を開くか、プルリクエストを作成するか、<a
    href="https://discord.com/channels/1170785031560646836/1247166813205303379" target="_blank"
    rel="noopener noreferrer">機能リクエスト チャンネル</a>に送信してください。

- 改善のアイデアがある場合は、GitHub リポジトリでディスカッションを開始することもできます。

## すべての貢献者に感謝

<a href="https://github.com/composiohq/composio/graphs/contributors">
    <img src="https://contributors-img.web.app/image?repo=composiodev/composio" alt="貢献者リスト" />
</a>

<br><br>

<div align="center">
    <p>
        <a href="https://dub.composio.dev/JoinHQ" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/c499721b-d3c2-4bfc-891f-4d74b587911f" alt="discord" />
        </a>&nbsp;&nbsp;&nbsp;
        <a href="https://www.youtube.com/@Composio" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/57072338-3e7a-42a5-bd2b-c58b143ffa29" alt="youtube" />
        </a>&nbsp;&nbsp;&nbsp;
        <a href="https://twitter.com/composiohq" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/14b87a1d-8ac7-48b4-ae7c-3a36aacc260b" alt="x" />
        </a>&nbsp;&nbsp;&nbsp;
        <a href="https://www.linkedin.com/company/composio-dev" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/cb6cc650-672e-41f6-8abf-dfc97fddfcbc" alt="linkedin" />
        </a>
    </p>
</div>
