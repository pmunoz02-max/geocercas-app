Read a JSON file (es.json) and detect values that are not Spanish.

Rules:
- flag if contains common English words (the, and, with, your, for, you, login, sign, manage)
- flag if sentence is mostly ASCII words without accents
- ignore numbers and short strings

Output:
- key
- value
- reason

Also print:
- total keys
- flagged keys
- percentage