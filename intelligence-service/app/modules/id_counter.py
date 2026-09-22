"""Simple counter for generating IDs"""
_Counter = 1

def get_next():
    global _Counter
    result = _Counter
    _Counter += 1
    return result