# features/ab_testing.py
import random
from typing import Dict, List

class ABTestEngine:
    def __init__(self):
        self.tests = {}

    def create_test(self, test_id: str, models: List[str], traffic_split: List[float] = None):
        if traffic_split is None:
            traffic_split = [1.0 / len(models)] * len(models)
        self.tests[test_id] = {
            "models": models,
            "splits": traffic_split,
            "results": {m: {"count": 0, "avg_latency": 0, "avg_length": 0} for m in models}
        }

    def select_model(self, test_id: str) -> str:
        test = self.tests.get(test_id)
        if not test:
            return "g4f:gpt-4o"
        r = random.random()
        cumulative = 0
        for i, split in enumerate(test["splits"]):
            cumulative += split
            if r <= cumulative:
                return test["models"][i]
        return test["models"][-1]

    def record_result(self, test_id: str, model: str, latency: float, response_length: int, user_rating: int = None):
        test = self.tests.get(test_id)
        if not test or model not in test["results"]:
            return
        results = test["results"][model]
        n = results["count"]
        results["avg_latency"] = (results["avg_latency"] * n + latency) / (n + 1)
        results["avg_length"] = (results["avg_length"] * n + response_length) / (n + 1)
        results["count"] += 1
        if user_rating:
            results["avg_rating"] = (results.get("avg_rating", 3) * n + user_rating) / (n + 1)

ab_test_engine = ABTestEngine()
ab_test_engine.create_test("default_chat_test", ["g4f:gpt-4o", "g4f:o3-mini", "g4f:gemini"])
