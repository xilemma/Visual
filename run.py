"""Convenience launcher: `python run.py` starts the dev server at http://127.0.0.1:8000"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "ndstudio.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["ndstudio", "frontend"],
    )
