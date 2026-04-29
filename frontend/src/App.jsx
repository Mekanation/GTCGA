import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import CardList from './pages/CardList'
import CardDetail from './pages/CardDetail'
import Weights from './pages/Weights'
import DeckAnalyzer from './pages/DeckAnalyzer'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<CardList />} />
        <Route path="card/:cardno" element={<CardDetail />} />
        <Route path="weights" element={<Weights />} />
        <Route path="deck" element={<DeckAnalyzer />} />
      </Route>
    </Routes>
  )
}
