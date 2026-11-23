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
