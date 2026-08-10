# features/multi_agent.py
import asyncio
from typing import List, Dict
from dataclasses import dataclass
from enum import Enum

class AgentRole(Enum):
    RESEARCHER = "researcher"
    CODER = "coder"
    CRITIC = "critic"
    CREATIVE = "creative"
    SUMMARIZER = "summarizer"

@dataclass
class Agent:
    name: str
    role: AgentRole
    system_prompt: str
    model: str = "gpt-4o"

class MultiAgentSystem:
    def __init__(self, provider_router):
        self.provider_router = provider_router
        self.agents = {
            AgentRole.RESEARCHER: Agent("باحث MijlAI", AgentRole.RESEARCHER, "أنت باحث متخصص. مهمتك البحث في الويب وجمع المعلومات الموثوقة."),
            AgentRole.CODER: Agent("مبرمج MijlAI", AgentRole.CODER, "أنت مبرمج خبير. مهمتك كتابة كود نظيف وفعال وتصحيح الأخطاء البرمجية."),
            AgentRole.CRITIC: Agent("ناقد MijlAI", AgentRole.CRITIC, "أنت ناقد محترف. راجع الأعمال وقدم ملاحظات بناءة ودقيقة."),
            AgentRole.SUMMARIZER: Agent("ملخص MijlAI", AgentRole.SUMMARIZER, "أنت ملخص متخصص. لخص المحتوى بشكل موجز وواضح ومفهوم.")
        }

    async def execute_task(self, task: str, required_roles: List[AgentRole] = None) -> Dict:
        if required_roles is None:
            required_roles = [AgentRole.RESEARCHER, AgentRole.SUMMARIZER]
        results = {}
        async def run_agent(role: AgentRole):
            agent = self.agents[role]
            messages = [
                {"role": "system", "content": agent.system_prompt},
                {"role": "user", "content": task}
            ]
            response = ""
            async for chunk in self.provider_router.generate_with_fallback(messages, agent.model):
                response += chunk
            results[role.value] = response
        await asyncio.gather(*[run_agent(role) for role in required_roles])
        if len(required_roles) > 1:
            merge_prompt = f"""
            قم بدمج النتائج التالية في إجابة واحدة متماسكة ومنسقة:
            
            {"\n\n".join([f"=== {role.value} ===\n{results[role.value]}" for role in required_roles])}
            """
            final_messages = [
                {"role": "system", "content": "أنت منسق محتوى MijlAI. قُم بدمج المعلومات وتنظيمها بنسق ممتاز."},
                {"role": "user", "content": merge_prompt}
            ]
            final_response = ""
            async for chunk in self.provider_router.generate_with_fallback(final_messages, "gpt-4o"):
                final_response += chunk
            results["final"] = final_response
        return results
