import { ZONAS, MOCK_OT } from '@/data/zonas3d'

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(35,22,8,0.93) 0%, rgba(55,38,14,0.93) 100%)',
  border: '2px solid #8a5a08',
  borderRadius: '5px',
  padding: '10px 14px',
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: '#dcc378',
  minWidth: '155px',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '8.5px',
  letterSpacing: '0.14em',
  color: '#8a5a08',
  marginBottom: '7px',
  textAlign: 'center',
}

const lineStyle: React.CSSProperties = {
  fontSize: '10.5px',
  lineHeight: '1.85',
  color: '#fff5be',
}

export function StatsCards() {
  const operativas = ZONAS.filter((z) => z.estado === 'operativo').length
  const alertas    = ZONAS.filter((z) => z.estado === 'alerta').length
  const detenidas  = ZONAS.filter((z) => z.estado === 'detenido').length

  const totalOtAbiertas = Object.values(MOCK_OT)
    .flat()
    .filter((ot) => ot.estado === 'abierta').length

  return (
    <>
      {/* ── Tarjeta izquierda: zonas de la planta ── */}
      <div style={{ position: 'absolute', top: 16, left: 16, ...cardStyle }}>
        <div style={titleStyle}>⚜ ZONAS DE LA PLANTA ⚜</div>
        <div style={lineStyle}>
          <div>Total zonas: <strong>{ZONAS.length}</strong></div>
          <div style={{ color: '#5cff5c' }}>● Operativas: {operativas}</div>
          {alertas > 0 && (
            <div style={{ color: '#ffcc33' }}>● Alerta: {alertas}</div>
          )}
          {detenidas > 0 && (
            <div style={{ color: '#ff4444' }}>● Detenidas: {detenidas}</div>
          )}
          <div style={{ borderTop: '1px solid #5a3a08', marginTop: 4, paddingTop: 4 }}>
            OT abiertas: <strong style={{ color: totalOtAbiertas > 0 ? '#ffcc33' : '#5cff5c' }}>
              {totalOtAbiertas}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Tarjeta derecha: estado de hoy ── */}
      <div style={{ position: 'absolute', top: 16, right: 16, ...cardStyle, textAlign: 'right' }}>
        <div style={titleStyle}>⚜ ESTADO HOY ⚜</div>
        <div style={lineStyle}>
          <div>Turno: <strong>A · 06:00–18:00</strong></div>
          <div style={{ color: '#ff4444' }}>Incidencias activas: 3</div>
          <div style={{ color: '#ffcc33' }}>Mant. próximo: 2</div>
          <div style={{ borderTop: '1px solid #5a3a08', marginTop: 4, paddingTop: 4 }}>
            Sensores OK: <strong style={{ color: '#5cff5c' }}>4 / 5</strong>
          </div>
        </div>
      </div>
    </>
  )
}
