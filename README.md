# Market Data Workbench

A small Python and React project for downloading historical stock prices, checking a dataset for common issues, and exploring a simple moving-average strategy.

The project uses a simple CSV handoff: `main.py` downloads and saves the data, then the dashboard imports that CSV in your browser.

## Features

- Download daily price data for a ticker and date range with `yfinance`.
- Save the results as a CSV file.
- Import the CSV into a React dashboard.
- Plot closing prices with a 20-observation moving average.
- Check dates, row order, duplicate dates, close prices, OHLC consistency, and large date gaps.
- Compare a 5/30-day moving-average strategy with buy-and-hold.
- View return, maximum drawdown, annualised volatility, and Sharpe ratio.

## Requirements

- Python 3
- Node.js and npm
- A working internet connection to download prices from Yahoo Finance

## Getting started

### 1. Download market data

From the project folder, install the Python dependency if needed and run the downloader:

```bash
python3 -m pip install yfinance
python3 main.py
```

Enter a ticker such as `AAPL`, then enter the start and end dates in `YYYY-MM-DD` format. The script creates a file named `<TICKER>_stock_data.csv` in the project folder.

If that CSV already exists, the script will not overwrite it. Rename or remove the old file before downloading again.

### 2. Start the dashboard

Open a second terminal in the project folder and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, select **Import CSV**, and choose the file created by `main.py`.

## CSV format

The dashboard requires `Date` and `Close` columns. It also uses `Open`, `High`, `Low`, and `Volume` when available. The downloader writes this format:

```csv
Date,Open,High,Low,Close,Volume
2025-01-02,184.10,185.20,183.80,184.75,43120000
```

CSV data is read in the browser and is not uploaded to a server.

## Backtest assumptions

- Start with 10,000 units of capital.
- Hold the asset when its prior 5-observation moving average is above its prior 30-observation moving average; otherwise hold cash.
- Apply an estimated 0.10% transaction cost when the position changes.
- Compare with buy-and-hold over the same observations.
- Annualise volatility and Sharpe using 252 trading days; assume a 0% risk-free rate.

This simple backtest is for learning and experimentation. It does not model taxes, slippage beyond the fixed cost, or all market mechanics. Results are not investment advice and past performance does not predict future returns.

## Project structure

```text
.
├── main.py          # Downloads market data and writes a CSV
├── src/
│   ├── App.jsx       # Dashboard, CSV import, checks, chart, and backtest
│   ├── App.css       # Dashboard styling
│   └── main.jsx      # React entry point
├── index.html
└── package.json
```  
