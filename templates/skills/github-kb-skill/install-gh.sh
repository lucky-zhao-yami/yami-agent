#!/bin/bash

# GitHub CLI Installation Script
# Supports: Linux (Debian/Ubuntu), macOS

set -e

echo "🔧 Installing GitHub CLI (gh)..."
echo ""

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux (Debian/Ubuntu)
    echo "📦 Detected Linux system"

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        echo "❌ This script requires sudo privileges. Please run with sudo."
        exit 1
    fi

    # Install
    echo "📥 Adding GitHub CLI package repository..."
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
        dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg

    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
        tee /etc/apt/sources.list.d/github-cli.list > /dev/null

    echo "🔄 Updating package list..."
    apt update

    echo "📦 Installing gh..."
    apt install gh -y

elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "📦 Detected macOS system"

    if command -v brew &> /dev/null; then
        echo "📦 Installing gh via Homebrew..."
        brew install gh
    else
        echo "❌ Homebrew not found. Please install Homebrew first:"
        echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
else
    echo "❌ Unsupported operating system: $OSTYPE"
    echo "Please visit https://cli.github.com/ for manual installation instructions."
    exit 1
fi

echo ""
echo "✅ GitHub CLI installed successfully!"
echo ""
echo "🔐 Next step: Authenticate with GitHub"
echo "   Run: gh auth login"
echo ""
echo "ℹ️  For more information: https://docs.github.com/en/github-cli"
