# features/plugin_system.py
import inspect
from typing import Dict, List, Callable, Any
from dataclasses import dataclass

@dataclass
class PluginInfo:
    name: str
    version: str
    author: str
    description: str
    functions: Dict[str, Callable]

class PluginSystem:
    def __init__(self):
        self.plugins: Dict[str, PluginInfo] = {}
        self.commands: Dict[str, Callable] = {}

    def register_function(self, plugin_name: str, func_name: str, func: Callable, description: str = ""):
        if plugin_name not in self.plugins:
            self.plugins[plugin_name] = PluginInfo(
                name=plugin_name,
                version="1.0.0",
                author="MijlAI Community",
                description=description,
                functions={}
            )
        self.plugins[plugin_name].functions[func_name] = func
        self.commands[f"{plugin_name}.{func_name}"] = func

    def execute_command(self, command: str, **kwargs) -> Any:
        if command not in self.commands:
            raise ValueError(f"Command '{command}' not found in MijlAI Plugin System.")
        return self.commands[command](**kwargs)

plugin_system = PluginSystem()
