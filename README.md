
# Pharos Testnet V2 Automation Bot 🤖

A comprehensive automation script for interacting with the Pharos Testnet V2 ecosystem, handling multiple wallets simultaneously with proxy support

**GitHub Repository**: https://github.com/lameairdrop/PharosTestnetBot-V2

## 🚀 Features

- **Multi-Wallet Support**: Process multiple wallets from environment variables
- **Proxy Rotation**: Load and rotate proxies from external file
- **Automated Tasks**:
  - AquaFlux NFT minting (token claiming, crafting, and minting)
  - DEX swapping (PHRS ↔ USDT/USDC) with multiple cycles
  - Liquidity provision to DVM pools
  - Social tipping functionality (X/Twitter)
  - Daily automated cycles with countdown timer

## 📋 Requirements

- Node.js (v16 or higher)
- Testnet PHRS tokens
- AquaFlux eligible wallets (for NFT features)

## 🛠️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/lameairdrop/PharosTestnetBot-V2.git
   cd Pharos-Testnet-V2
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   - Copy `.env.example` to `.env`
   - Add your private keys:
     ```
     PRIVATE_KEY_1=0xYourPrivateKey1
     PRIVATE_KEY_2=0xYourPrivateKey2
     # Add more as needed
     ```

4. **Add proxies** (optional):
   - Create `proxies.txt` and add your proxies (one per line)
   - Format: `http://user:pass@host:port`

5. **Run the bot**:
   ```bash
   node main.js
   ```

## ⚙️ Configuration

The script will interactively prompt for:
- Number of swap cycles per wallet
- Liquidity add transactions count
- AquaFlux mint count
- X username for tipping
- Number of tips to send

## ⚠️ Important Notes

- **Testnet Only**: Designed for Pharos Testnet V2 only
- **Use at Your Own Risk**: Understand all transactions before executing
- **Fund Wallets**: Ensure wallets have sufficient PHRS for gas fees

## 📝 File Structure

```
Pharos-Testnet-V2/
├── main.js          # Main bot script
├── .env             # Environment variables (create from .env.example)
├── proxies.txt      # Proxy list (optional)
├── package.json     # Dependencies
└── README.md        # This file
```

## ❓ Support

For issues and questions, please check the GitHub repository issues section.
```
