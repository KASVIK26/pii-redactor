"""
Test script to verify if FastAPI BackgroundTasks actually execute
"""
import asyncio
import time
from fastapi import BackgroundTasks, FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

# Global flag to track if task executed
task_executed = False
task_result = None

def background_task(name: str):
    """Simple background task for testing"""
    global task_executed, task_result
    print(f"[TEST TASK] STARTED at {time.time()}")
    time.sleep(1)  # Simulate work
    task_executed = True
    task_result = f"Task {name} completed at {time.time()}"
    print(f"[TEST TASK] COMPLETED: {task_result}")

@app.post("/test-task")
async def test_task_endpoint(background_tasks: BackgroundTasks):
    """Endpoint that queues a background task"""
    print(f"[ENDPOINT] Endpoint called at {time.time()}")
    
    # Check if BackgroundTasks is None (the bug!)
    if background_tasks is None:
        return JSONResponse(
            {"error": "BackgroundTasks is None - INJECTION FAILED!"},
            status_code=500
        )
    
    # Queue the background task
    background_tasks.add_task(background_task, "test")
    print(f"[ENDPOINT] Task queued, returning response")
    
    return {"status": "task_queued", "message": "Task should execute in background"}

@app.get("/test-status")
async def test_status():
    """Check if background task executed"""
    global task_executed, task_result
    return {
        "task_executed": task_executed,
        "task_result": task_result
    }

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*80)
    print("TESTING FASTAPI BACKGROUND TASKS")
    print("="*80)
    print("\n1. Start this server")
    print("2. POST http://localhost:9999/test-task")
    print("3. Wait a few seconds")
    print("4. GET http://localhost:9999/test-status")
    print("\nIf task_executed=true, background tasks work!")
    print("If task_executed=false, background tasks NOT working!")
    print("="*80 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=9999)
