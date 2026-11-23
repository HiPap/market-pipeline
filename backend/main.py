import csv
from datetime import date

import yfinance


class StockDataFetcher:
    def __init__(self, ticker: str, start_date: date, end_date: date):
        self.ticker = ticker.strip().upper()
        self.start_date = start_date
        self.end_date = end_date

        if not self.ticker.isalnum():
            raise ValueError("Enter an alphanumeric ticker, such as AAPL.")
        if self.start_date >= self.end_date:
            raise ValueError("The start date must be before the end date.")
        if self.end_date > date.today():
            raise ValueError("Dates cannot be in the future.")

    def fetch_stock_data(self):
        return yfinance.download(
            self.ticker,
            start=self.start_date.isoformat(),
            end=self.end_date.isoformat(),
            auto_adjust=True,
            multi_level_index=False,
        )

    def write_csv(self, data, filename=None):
        if data.empty:
            print("No data available for the given ticker and date range.")
            return

        if filename is None:
            filename = f"{self.ticker}_stock_data.csv"

        try:
            # "x" creates a new file and avoids overwriting an existing one.
            with open(filename, "x", newline="", encoding="utf-8") as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(["Date", *data.columns])

                for trading_date, row in data.iterrows():
                    writer.writerow(
                        [trading_date.strftime("%Y-%m-%d"), *row]
                    )
        except FileExistsError:
            print(f"{filename} already exists. Rename or remove it before saving again.")
            return

        print(f"Saved {len(data)} rows to {filename}.")


def main():
    ticker = input("Enter the stock ticker symbol (e.g. AAPL): ")
    start_input = input("Enter the start date (YYYY-MM-DD): ").strip()
    end_input = input("Enter the end date (YYYY-MM-DD): ").strip()

    try:
        start_date = date.fromisoformat(start_input)
        end_date = date.fromisoformat(end_input)

        if start_date.isoformat() != start_input or end_date.isoformat() != end_input:
            raise ValueError
    except ValueError:
        print("Invalid date. Please use YYYY-MM-DD.")
        return

    try:
        fetcher = StockDataFetcher(ticker, start_date, end_date)
    except ValueError as error:
        print(error)
        return

    data = fetcher.fetch_stock_data()
    fetcher.write_csv(data)


if __name__ == "__main__":
    main()