import os
import sys

# Critical: Inject 'backend' into sys.path so 'app.main' can be imported correctly by Vercel
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from app.main import app

# This 'app' object is what Vercel will look for to serve the API