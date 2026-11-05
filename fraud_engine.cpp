#include <iostream>
#include <cstdlib>
#include <string>

// Aurora Bank C++ Fraud Detection Engine
// Input: amount, available_balance, recent_transaction_count
// Output: score|status|reason
int main(int argc, char* argv[]) {
    if (argc != 4) {
        std::cerr << "Usage: fraud_engine <amount> <balance> <recent_tx_count>\n";
        return 2;
    }
    const double amount = std::atof(argv[1]);
    const double balance = std::atof(argv[2]);
    const int recent = std::atoi(argv[3]);
    if (amount <= 0 || balance < 0 || recent < 0) {
        std::cout << "100|BLOCK|Invalid transaction values";
        return 0;
    }
    int score = 0;
    std::string reason = "Normal transaction pattern";
    if (amount >= 100000) { score += 60; reason = "Very high transaction amount"; }
    else if (amount >= 50000) { score += 35; reason = "High transaction amount"; }
    if (balance > 0 && amount >= balance * 0.80) {
        score += 25; reason = "Transfer uses at least 80 percent of available balance";
    }
    if (recent >= 8) { score += 25; reason = "Unusual transaction frequency"; }
    else if (recent >= 5) { score += 15; reason = "Elevated transaction frequency"; }
    if (score > 100) score = 100;
    const char* status = score >= 80 ? "BLOCK" : (score >= 40 ? "REVIEW" : "SAFE");
    std::cout << score << "|" << status << "|" << reason;
    return 0;
}
