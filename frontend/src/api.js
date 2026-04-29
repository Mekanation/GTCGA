import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Build weight params from weights object
function wparams(weights) {
  return Object.fromEntries(Object.entries(weights).map(([k,v]) => [k, v]))
}

export const getCards = (filters, weights, metaCardnos = []) =>
  api.get('/cards', { params: {
    ...filters,
    ...wparams(weights),
    sort_by: 'score',
    meta_cardnos: metaCardnos.join(',') || undefined,
  }}).then(r => r.data)

export const getCard = (cardno, weights, metaCardnos = []) =>
  api.get(`/cards/${encodeURIComponent(cardno)}`, { params: {
    ...wparams(weights),
    meta_cardnos: metaCardnos.join(',') || undefined,
  }}).then(r => r.data)

export const getFilters = () => api.get('/filters').then(r => r.data)

export const lookupCards = (cardnos) =>
  api.post('/cards/lookup', { cardnos }).then(r => r.data)

export const analyzeDeck = (entries, weights, metaCardnos = []) =>
  api.post('/deck/analyze', {
    entries,
    weights,
    meta_cardnos: metaCardnos,
  }).then(r => r.data)

export default api
