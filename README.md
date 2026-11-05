AURORA BANK — C++ + WEB PROJECT

TECH STACK
- C++17: mandatory transaction fraud detection engine (fraud_engine.cpp)
- Node.js: HTTP server, API routes, sessions and JSON database access
- HTML/CSS/JavaScript: responsive banking website and dashboard
- JSON: demo database

HOW C++ IS USED
Every account-to-account transfer is checked by the compiled C++ fraud engine before money is moved.
The engine calculates a risk score using transaction amount, percentage of available balance, and
the account's transaction count in the last hour:
- SAFE (score below 40): allow transfer
- REVIEW (40–79): allow transfer and store the risk assessment on the account
- BLOCK (80–100): reject the transfer

RUN ON WINDOWS (VS CODE)
1. Install Node.js LTS.
2. Install GCC/G++ (for example, MinGW-w64 / MSYS2) and add its bin folder to Windows PATH.
3. Open this project folder in VS Code.
4. In the terminal run: g++ --version
5. Run: npm.cmd start
6. Open: http://localhost:3000

The server compiles fraud_engine.cpp automatically each time it starts. If g++ is not found,
install/configure GCC and restart the VS Code terminal. The generated .exe is local build output
and is not required in the ZIP.

DEMO LOGIN
Account: 1001
PIN: 1234

IMPORTANT
This is an academic demonstration, not a real banking system. Branches, customer records,
balances, and transactions are fictional. Do not use real banking credentials or money.
