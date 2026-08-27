# Sandbox flow

The agent never guesses the culprit. Flow:

1. Fetch evidence read-only via MCP (`list_deploys`, `deploy_stats`, `query_db`).
2. Write a short Python script adapting `bisect_template.py`, with the fetched rows
   embedded as JSON constants.
3. Run it in the Daytona sandbox (TrueForge `codeMode`).
4. Read the single JSON verdict the script prints and report it, citing the numbers.

`bisect_template.py` ranks candidate deploys by error-rate delta (3h pre vs 3h post)
and prints `{ verdict, culprit, service, delta_error_rate, ratio, runner_up, ... }`.