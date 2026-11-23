import { useMemo, useRef, useState } from 'react'
import './App.css'

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) {
    throw new Error('The CSV needs a header and at least one data row.')
  }

  const headers = lines[0]
    .split(',')
    .map((value) => value.trim().replace(/^"|"$/g, '').toLowerCase())

  const findColumn = (names) => headers.findIndex((header) => names.includes(header))
  const columns = {
    date: findColumn(['date', 'datetime', 'timestamp']),
    open: findColumn(['open']),
    high: findColumn(['high']),
    low: findColumn(['low']),
    close: findColumn(['close', 'adj close', 'adj_close', 'adjusted close']),
    volume: findColumn(['volume', 'vol']),
  }

  if (columns.date < 0 || columns.close < 0) {
    throw new Error('Could not find required Date and Close columns.')
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((value) => value.trim().replace(/^"|"$/g, ''))
    const numberAt = (index) => (index < 0 || !cells[index] ? null : Number(cells[index]))

    return {
      date: cells[columns.date],
      open: numberAt(columns.open),
      high: numberAt(columns.high),
      low: numberAt(columns.low),
      close: numberAt(columns.close),
      volume: numberAt(columns.volume),
    }
  })
}

function auditRows(rows) {
  const dates = rows.map((row) => row.date)
  const duplicateCount = dates.length - new Set(dates).size
  const invalidDates = rows.filter(
    (row) => !row.date || Number.isNaN(Date.parse(row.date))
  ).length

  const outOfOrder = rows.slice(1).filter((row, index) => {
    const current = Date.parse(row.date)
    const previous = Date.parse(rows[index].date)
    return Number.isFinite(current) && Number.isFinite(previous) && current < previous
  }).length

  const invalidCloses = rows.filter(
    (row) => !Number.isFinite(row.close) || row.close <= 0
  ).length

  const invalidOhlc = rows.filter((row) => {
    if (![row.open, row.high, row.low].every(Number.isFinite)) return false
    return (
      row.high < Math.max(row.open, row.close, row.low) ||
      row.low > Math.min(row.open, row.close, row.high)
    )
  }).length

  const sortedDates = [...new Set(dates)].sort()
  const largeGaps = sortedDates.slice(1).filter((date, index) => {
    const gapDays =
      (Date.parse(date) - Date.parse(sortedDates[index])) / 86_400_000
    return gapDays > 5
  }).length

  const checks = [
    {
      label: 'Valid dates',
      detail: invalidDates ? `${invalidDates} invalid` : 'All dates parse correctly',
      ok: invalidDates === 0,
    },
    {
      label: 'Date order',
      detail: outOfOrder ? `${outOfOrder} rows out of order` : 'Rows are chronological',
      ok: outOfOrder === 0,
    },
    {
      label: 'Positive close prices',
      detail: invalidCloses ? `${invalidCloses} invalid` : 'All close prices are positive',
      ok: invalidCloses === 0,
    },
    {
      label: 'Duplicate dates',
      detail: duplicateCount ? `${duplicateCount} duplicate rows` : 'No duplicate dates found',
      ok: duplicateCount === 0,
    },
    {
      label: 'OHLC consistency',
      detail: invalidOhlc ? `${invalidOhlc} inconsistent rows` : 'High and low values look consistent',
      ok: invalidOhlc === 0,
    },
    {
      label: 'Large date gaps',
      detail: largeGaps ? `${largeGaps} gaps over 5 days` : 'No gaps over 5 calendar days',
      ok: largeGaps === 0,
    },
  ]

  return { checks, duplicateCount }
}

function backtest(rows) {
  const valid = [...rows]
    .filter(
      (row) =>
        row.date &&
        Number.isFinite(Date.parse(row.date)) &&
        Number.isFinite(row.close) &&
        row.close > 0
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

  if (valid.length < 35) return null

  let strategyValue = 10_000
  let benchmarkValue = 10_000
  let position = 0
  let peak = 10_000
  let maxDrawdown = 0
  const dailyReturns = []

  for (let index = 1; index < valid.length; index += 1) {
    let nextPosition = position

    if (index >= 30) {
      const fast =
        valid.slice(index - 5, index).reduce((sum, row) => sum + row.close, 0) / 5
      const slow =
        valid.slice(index - 30, index).reduce((sum, row) => sum + row.close, 0) / 30
      nextPosition = fast > slow ? 1 : 0
    }

    const assetReturn = valid[index].close / valid[index - 1].close - 1
    const transactionCost = nextPosition !== position ? 0.001 : 0
    const strategyReturn = nextPosition * assetReturn - transactionCost

    position = nextPosition
    strategyValue *= 1 + strategyReturn
    benchmarkValue *= 1 + assetReturn
    dailyReturns.push(strategyReturn)
    peak = Math.max(peak, strategyValue)
    maxDrawdown = Math.min(maxDrawdown, strategyValue / peak - 1)
  }

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    dailyReturns.length
  const volatility = Math.sqrt(variance) * Math.sqrt(252)

  return {
    strategyReturn: strategyValue / 10_000 - 1,
    benchmarkReturn: benchmarkValue / 10_000 - 1,
    maxDrawdown,
    volatility,
    sharpe: volatility ? (mean * 252) / volatility : 0,
  }
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value)
}

function PriceChart({ rows }) {
  const width = 760
  const height = 270
  const padding = { top: 18, right: 10, bottom: 28, left: 10 }
  const validRows = rows.filter((row) => Number.isFinite(row.close))
  const values = validRows.map((row) => row.close)

  if (!values.length) {
    return <div className="empty-chart">Run main.py, then import its CSV to see the price chart.</div>
  }

  const minimum = Math.min(...values) * 0.985
  const maximum = Math.max(...values) * 1.015
  const x = (index) =>
    padding.left +
    (index / Math.max(values.length - 1, 1)) *
      (width - padding.left - padding.right)
  const y = (value) =>
    padding.top +
    ((maximum - value) / (maximum - minimum || 1)) *
      (height - padding.top - padding.bottom)

  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const averagePoints = values
    .map((value, index) => {
      if (index < 19) return null
      const average =
        values.slice(index - 19, index + 1).reduce((sum, item) => sum + item, 0) / 20
      return `${x(index)},${y(average)}`
    })
    .filter(Boolean)
    .join(' ')

  const area = `${padding.left},${height - padding.bottom} ${points} ${
    width - padding.right
  },${height - padding.bottom}`

  const labels = [0, Math.floor((values.length - 1) / 2), values.length - 1].map(
    (index) => validRows[index]?.date
  )

  return (
    <div className="chart-wrap">
      <svg
        className="price-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Closing price chart with a 20 observation moving average"
      >
        {[0, 1, 2, 3].map((line) => {
          const lineY =
            padding.top +
            line * ((height - padding.top - padding.bottom) / 3)

          return (
            <line
              key={line}
              x1={padding.left}
              x2={width - padding.right}
              y1={lineY}
              y2={lineY}
              className="grid-line"
            />
          )
        })}

        <polygon points={area} className="chart-area" />
        {averagePoints && <polyline points={averagePoints} className="chart-average" />}
        <polyline points={points} className="chart-line" />
      </svg>

      <div className="chart-dates">
        <span>{labels[0] || ''}</span>
        <span>{labels[1] || ''}</span>
        <span>{labels[2] || ''}</span>
      </div>
    </div>
  )
}

function Icon({ name }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 14 4-4 3 3 6-7" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z" />
        <path d="M12 9v4m0 3h.01" />
      </>
    ),
  }

  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Metric({ label, value, note, positive, icon }) {
  const valueClass =
    positive === undefined ? '' : positive ? 'metric-positive' : 'metric-negative'

  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong className={valueClass}>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

export default function App() {
  const [rows, setRows] = useState([])
  const [dataLabel, setDataLabel] = useState('No market data loaded')
  const [dataSource, setDataSource] = useState('—')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef(null)

  const audit = useMemo(() => auditRows(rows), [rows])
  const results = useMemo(() => backtest(rows), [rows])

  const lastClose = [...rows]
    .filter(
      (row) =>
        row.date &&
        Number.isFinite(Date.parse(row.date)) &&
        Number.isFinite(row.close)
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .at(-1)?.close

  const status = !rows.length
    ? 'No data loaded'
    : audit.checks.every((check) => check.ok)
      ? 'All checks passed'
      : 'Review needed'

  function readFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        setRows(parseCsv(String(reader.result || '')))
        setDataLabel(file.name)
        setDataSource('CSV import')
        setNotice('CSV loaded in this browser.')
        setError('')
      } catch (importError) {
        setError(importError.message || 'Could not read this CSV file.')
      }
      event.target.value = ''
    }

    reader.onerror = () => setError('The selected file could not be read.')
    reader.readAsText(file)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Market Lab home">
          <span className="brand-mark"><span /></span>
          <span>
            market<span className="brand-light">lab</span>
            <small>RESEARCH WORKSPACE</small>
          </span>
        </a>

        <div className="side-label">WORKSPACE</div>
        <nav className="navigation" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><Icon name="grid" />Overview</a>
          <a className="nav-item" href="#chart"><Icon name="chart" />Research</a>
          <a className="nav-item" href="#data-quality"><Icon name="database" />Data quality</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-card">
            <div className="workspace-icon">ML</div>
            <div><strong>Personal workspace</strong><span>Local research</span></div>
            <span className="dots">···</span>
          </div>
          <div className="sidebar-credit">Built for curious minds.<br />Data first. Decisions second.</div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div>
          <div className="topbar-right"><span className="live-dot" /> LOCAL SESSION <span className="avatar">GT</span></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">MARKET DATA WORKBENCH <span className="eyebrow-line" /></div>
              <h1>Good research starts<br className="mobile-break" /> with good data.</h1>
              <p>Inspect market prices, catch data issues, and test a simple strategy.</p>
            </div>
          </section>

          <section className="data-source-card">
            <div className="source-step">
              <span className="step-number">1</span>
              <span>Run <code>python3 main.py</code> in Terminal to download prices.</span>
            </div>
            <div className="source-step">
              <span className="step-number">2</span>
              <span>Import the CSV file that Python creates.</span>
            </div>
            <button
              className="button button-primary import-button"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload" />Import CSV
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={readFile}
            />
          </section>

          <p className="form-hint">
            The dashboard analyses the CSV you import. It does not use sample or hardcoded prices.
          </p>

          {error && (
            <div className="error-banner" role="alert">
              <Icon name="alert" />{error}
            </div>
          )}
          {notice && !error && <div className="notice-banner">{notice}</div>}

          <section className="dataset-bar" aria-label="Selected dataset">
            <div className="dataset-left">
              <span className="ticker-badge">{rows.length ? 'CSV' : '—'}</span>
              <div>
                <strong>{dataLabel}</strong>
                <span>
                  {rows.length.toLocaleString()} observations <i /> {rows[0]?.date || '—'} —{' '}
                  {rows.at(-1)?.date || '—'}
                </span>
              </div>
            </div>
            <div className="dataset-right">
              <span className={`status-pill ${
                status === 'All checks passed'
                  ? 'status-good'
                  : status === 'Review needed'
                    ? 'status-warn'
                    : 'status-idle'
              }`}>
                <span /> {status}
              </span>
              <span className="dataset-divider" />
              <span className="currency-label">SOURCE <strong>{dataSource}</strong></span>
            </div>
          </section>

          <section className="metrics-grid" aria-label="Key metrics">
            <Metric
              label="LAST CLOSE"
              value={lastClose ? lastClose.toFixed(2) : '—'}
              note="Latest valid observation"
              icon="↗"
            />
            <Metric
              label="STRATEGY RETURN"
              value={results ? formatPercent(results.strategyReturn) : rows.length ? 'Need 35+ rows' : '—'}
              note={results ? `vs. ${formatPercent(results.benchmarkReturn)} buy & hold` : '5 / 30 day crossover'}
              positive={results ? results.strategyReturn >= 0 : undefined}
            />
            <Metric
              label="MAX DRAWDOWN"
              value={results ? formatPercent(results.maxDrawdown) : '—'}
              note="Strategy peak-to-trough"
            />
            <Metric
              label="DATA HEALTH"
              value={rows.length ? `${audit.checks.filter((check) => check.ok).length}/${audit.checks.length}` : '—'}
              note={rows.length ? `${audit.duplicateCount} duplicate dates detected` : 'Import data'}
              positive={rows.length ? audit.checks.every((check) => check.ok) : undefined}
            />
          </section>

          <div className="content-grid">
            <section className="panel chart-panel" id="chart">
              <div className="panel-heading chart-heading">
                <div>
                  <div className="panel-kicker">PRICE HISTORY</div>
                  <h2>Closing price</h2>
                </div>
                <div className="chart-legend">
                  <span><i className="legend-price" />Close</span>
                  <span><i className="legend-average" />20D average</span>
                </div>
              </div>
              <PriceChart rows={rows} />
              <div className="chart-footer">
                <span>PRICE · DAILY</span>
                <span>20 observation moving average</span>
              </div>
            </section>

            <section className="panel quality-panel" id="data-quality">
              <div className="panel-heading">
                <div>
                  <div className="panel-kicker">VALIDATION</div>
                  <h2>Data quality</h2>
                </div>
                <span className={`quality-count ${
                  audit.checks.every((check) => check.ok) ? '' : 'needs-review'
                }`}>
                  {rows.length
                    ? `${audit.checks.filter((check) => check.ok).length}/${audit.checks.length}`
                    : '—'}
                </span>
              </div>

              <p className="panel-description">
                Checks run on the current dataset before analysis.
              </p>

              <div className="check-list">
                {rows.length ? (
                  audit.checks.map((check) => (
                    <div className="check-row" key={check.label}>
                      <span className={`check-icon ${check.ok ? 'check-ok' : 'check-bad'}`}>
                        <Icon name={check.ok ? 'check' : 'alert'} />
                      </span>
                      <div>
                        <strong>{check.label}</strong>
                        <span>{check.detail}</span>
                      </div>
                      <span className={`check-state ${check.ok ? 'text-good' : 'text-bad'}`}>
                        {check.ok ? 'PASS' : 'CHECK'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="quality-empty">Load a dataset to run validation checks.</div>
                )}
              </div>

              <div className="quality-footnote">
                Large gaps are calendar gaps over 5 days; weekends and market holidays can be expected.
              </div>
            </section>
          </div>

          <section className="panel backtest-panel">
            <div className="panel-heading backtest-heading">
              <div>
                <div className="panel-kicker">STRATEGY SNAPSHOT</div>
                <h2>Moving average crossover</h2>
              </div>
              <span className="strategy-tag">LONG / CASH</span>
            </div>

            <div className="strategy-description">
              A simple 5-day / 30-day moving average rule. Signals use prior observations and apply an estimated 0.10% cost each time the position changes.
            </div>

            <div className="backtest-stats">
              <div className="backtest-stat">
                <span>STRATEGY VALUE</span>
                <strong>{results ? formatNumber(10_000 * (1 + results.strategyReturn)) : '—'}</strong>
                <small>Starting capital 10,000 units</small>
              </div>
              <div className="backtest-stat">
                <span>BUY &amp; HOLD</span>
                <strong>{results ? formatNumber(10_000 * (1 + results.benchmarkReturn)) : '—'}</strong>
                <small>Same dates, before costs</small>
              </div>
              <div className="backtest-stat">
                <span>ANNUALISED VOLATILITY</span>
                <strong>{results ? formatPercent(results.volatility) : '—'}</strong>
                <small>Daily returns × √252</small>
              </div>
              <div className="backtest-stat">
                <span>SHARPE RATIO</span>
                <strong>{results ? results.sharpe.toFixed(2) : '—'}</strong>
                <small>Risk-free rate assumed 0%</small>
              </div>
            </div>

            {rows.length > 0 && !results && (
              <div className="not-enough-data">
                Import at least 35 valid daily observations to calculate this strategy.
              </div>
            )}
          </section>

          <footer className="page-footer">
            <span>MARKETLAB <b>·</b> PERSONAL RESEARCH TOOL</span>
            <span>Past performance is not indicative of future results.</span>
          </footer>
        </div>
      </main>
    </div>
  )
}