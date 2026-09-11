import { CryptoCurrency, FiatCurrency, getExchangeRates, Provider } from '@nimiq/utils/fiat-api'

let cached: { rate: number, at: number } | null = null

/** NIM price in USD, or null when the price source is unreachable. */
export async function getNimUsdRate(): Promise<number | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.rate
  try {
    // CoinGecko: keyless and CORS-enabled. CryptoCompare (the library default) now requires an API key.
    const rates = await getExchangeRates([CryptoCurrency.NIM], [FiatCurrency.USD], Provider.CoinGecko)
    const rate = rates[CryptoCurrency.NIM][FiatCurrency.USD]
    if (!rate) return null
    cached = { rate, at: Date.now() }
    return rate
  }
  catch {
    return null
  }
}
