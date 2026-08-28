"""
MCP (Model Context Protocol) client — stdio JSON-RPC 2.0.
Connects to local MCP servers (filesystem / fetch / memory via npx, or any
stdio command), lists their tools, and executes tool calls on demand.

No API keys: MCP servers run locally; `npx` fetches open-source packages.
Used by the agentic tool-loop: the model requests a tool call, the server
executes it through MCP, and the result is returned to the conversation.
"""
import asyncio
import json
import logging
import os
import shutil
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mcp")

_VENV_PYTHON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "venv", "bin", "python3")

# Built-in, zero-config MCP servers (no keys required)
DEFAULT_SERVERS: Dict[str, Dict[str, Any]] = {
    "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", os.path.expanduser("~/UIAIv2.0/workspaces")],
        "desc": "قراءة/كتابة الملفات داخل مساحة العمل المعزولة",
    },
    "memory": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-memory"],
        "desc": "ذاكرة معرفية (knowledge graph) عبر MCP",
    },
    # The official fetch server is a Python package (mcp-server-fetch) — run it
    # with the project venv interpreter so it needs no npx download.
    "fetch": {
        "command": _VENV_PYTHON,
        "args": ["-m", "mcp_server_fetch"],
        "desc": "جلب محتوى روابط الويب كنص",
    },
}

# Optional extra servers from the environment:
# MCP_SERVERS='{"name": {"command": "...", "args": ["..."], "desc": "..."}}'
try:
    _extra = json.loads(os.environ.get("MCP_SERVERS", "") or "{}")
    if isinstance(_extra, dict):
        for _name, _cfg in _extra.items():
            if isinstance(_cfg, dict) and _cfg.get("command"):
                DEFAULT_SERVERS[str(_name)] = {
                    "command": str(_cfg["command"]),
                    "args": [str(a) for a in _cfg.get("args", [])],
                    "desc": str(_cfg.get("desc", "خادم MCP مخصص")),
                }
except Exception as _e:
    logger.warning(f"Invalid MCP_SERVERS JSON ignored: {_e}")


class MCPClient:
    """Minimal stdio MCP client: initialize → tools/list → tools/call."""

    def __init__(self, name: str, command: str, args: List[str], timeout: float = 60.0):
        self.name = name
        self.command = command
        self.args = args
        self.timeout = timeout
        self.proc: Optional[asyncio.subprocess.Process] = None
        self._next_id = 0
        self.tools: List[Dict[str, Any]] = []
        self.available = shutil.which(command) is not None

    async def _send(self, method: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        self._next_id += 1
        req_id = self._next_id
        message = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params})
        self.proc.stdin.write(message.encode() + b"\n")
        await self.proc.stdin.drain()
        # read until we get the response with our id (skip notifications)
        while True:
            line = await asyncio.wait_for(self.proc.stdout.readline(), timeout=self.timeout)
            if not line:
                return None
            try:
                obj = json.loads(line.decode())
            except Exception:
                continue
            if obj.get("id") == req_id:
                return obj

    async def connect(self) -> bool:
        if not self.available:
            logger.info(f"[mcp:{self.name}] command not found: {self.command}")
            return False
        try:
            self.proc = await asyncio.create_subprocess_exec(
                self.command, *self.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            init = await self._send("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "mijlai-mcp", "version": "1.0.0"},
            })
            if init is None or "error" in init:
                return False
            # initialized notification (no response expected)
            note = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"})
            self.proc.stdin.write(note.encode() + b"\n")
            await self.proc.stdin.drain()
            tools_resp = await self._send("tools/list", {})
            if tools_resp and "result" in tools_resp:
                self.tools = tools_resp["result"].get("tools", [])
                return True
            return False
        except Exception as e:
            logger.warning(f"[mcp:{self.name}] connect failed: {e}")
            await self.close()
            return False

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        if not self.proc:
            raise RuntimeError("MCP client not connected")
        resp = await self._send("tools/call", {"name": tool_name, "arguments": arguments})
        if resp is None:
            raise RuntimeError("empty MCP response")
        if "error" in resp:
            raise RuntimeError(str(resp["error"]))
        return resp.get("result")

    async def close(self):
        try:
            if self.proc and self.proc.returncode is None:
                self.proc.terminate()
        except Exception:
            pass
        self.proc = None


# Registry of live client instances (lazy)
_clients: Dict[str, MCPClient] = {}


async def get_client(server_name: str) -> Optional[MCPClient]:
    """Connect (or reuse) an MCP server by name from DEFAULT_SERVERS."""
    if server_name in _clients and _clients[server_name].proc and _clients[server_name].tools:
        return _clients[server_name]
    cfg = DEFAULT_SERVERS.get(server_name)
    if not cfg:
        return None
    client = MCPClient(server_name, cfg["command"], cfg["args"])
    if await client.connect():
        _clients[server_name] = client
        return client
    return None


async def list_all_tools() -> List[Dict[str, Any]]:
    """Aggregate tools from every configured MCP server (best effort)."""
    out = []
    for name, cfg in DEFAULT_SERVERS.items():
        client = await get_client(name)
        if client:
            for t in client.tools:
                out.append({"server": name, "name": t.get("name"), "description": t.get("description", "")[:200]})
    return out


async def execute_tool(server_name: str, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    client = await get_client(server_name)
    if not client:
        return {"ok": False, "error": f"MCP server '{server_name}' غير متاح"}
    try:
        result = await client.call_tool(tool_name, arguments or {})
        # normalize content blocks to plain text
        text_parts = []
        if isinstance(result, dict):
            for item in result.get("content", []):
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
        return {"ok": True, "result": "\n".join(text_parts) or json.dumps(result, ensure_ascii=False)[:4000]}
    except Exception as e:
        return {"ok": False, "error": str(e)}
