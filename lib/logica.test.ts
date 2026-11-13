import { describe, expect, it } from 'vitest'
import { normalizarCodigo, normalizarTexto, parsearNumero, similitud } from './normalizar'
import { calcularPrecioBs, formatoBs, formatoUsd } from './precios'
import { linkWhatsapp, mensajePedido, telefonoInternacional } from './whatsapp'
import { desplazarMes, mesActual, mesValido, nombreMes, rangoMes, resumenMes } from './pedidos-web'
import {
  detectarEncabezado,
  encabezados,
  extraerFilas,
  mapeoValido,
  planificarImportacion,
  sugerirMapeo,
  type Celda,
  type ProductoExistente,
} from './inventario/importador'
import ExcelJS from 'exceljs'
import { leerXlsx } from './inventario/excel'
import { decidirAplicacion, esRepetido, hashArchivo, limiteOcultar, textoResultado } from './inventario/flujo'
import { parsearTasaBcv, parsearTasaDolarApi } from './bcv'
import { cambiosPorFicha, pedidoFicha, validarFicha } from './ia'
import { erroresSeguidos, MAX_ERRORES_SEGUIDOS, textoErrorBase } from './fichas-lote'

describe('normalización (debe coincidir con el SQL)', () => {
  it('códigos', () => {
    expect(normalizarCodigo(' 00123 ')).toBe('00123')
    expect(normalizarCodigo('123.0')).toBe('123')
    expect(normalizarCodigo(123)).toBe('123')
    expect(normalizarCodigo('ab 12')).toBe('AB12')
    expect(normalizarCodigo('  ')).toBeNull()
  })
  it('texto', () => {
    expect(normalizarTexto('  Sauvage   ÉDT ')).toBe('sauvage edt')
    expect(normalizarTexto('Acqua di Giò')).toBe('acqua di gio')
  })
  it('números en formato venezolano e internacional', () => {
    expect(parsearNumero('1.234,56')).toBe(1234.56)
    expect(parsearNumero('1,234.56')).toBe(1234.56)
    expect(parsearNumero('$ 45')).toBe(45)
    expect(parsearNumero(12)).toBe(12)
    expect(parsearNumero('abc')).toBeNull()
  })
  it('similitud', () => {
    expect(similitud('Sauvage EDT 100ml', 'Sauvage EDT')).toBeGreaterThan(0.45)
    expect(similitud('Good Girl', 'Sauvage')).toBeLessThan(0.2)
  })
})

describe('precios', () => {
  const cfg = { tasa_bcv: 40.5, recargo_bs_pct: 10, redondeo_bs: 0.01 }
  it('igual que la prueba SQL: 100 USD -> 4455 Bs', () => {
    expect(calcularPrecioBs(100, cfg)).toBe(4455)
    expect(calcularPrecioBs(12, cfg)).toBe(534.6)
  })
  it('redondeo a Bs. enteros y a decenas', () => {
    expect(calcularPrecioBs(1.23, { ...cfg, redondeo_bs: 1 })).toBe(55)
    expect(calcularPrecioBs(1.23, { ...cfg, redondeo_bs: 10 })).toBe(50)
  })
  it('sin tasa no hay precio en Bs', () => {
    expect(calcularPrecioBs(10, { ...cfg, tasa_bcv: 0 })).toBeNull()
  })
  it('formato', () => {
    expect(formatoBs(9578.25)).toMatch(/9\.?578,25/)
    expect(formatoUsd(215)).toMatch(/^\$215,00$/)
  })
})

describe('WhatsApp', () => {
  it('arma el mensaje en bolívares con delivery', () => {
    const msg = mensajePedido({
      numero: 1001,
      cliente_nombre: 'Ana Pérez',
      entrega: 'delivery',
      zona: 'Las Mercedes',
      direccion: 'Calle 1',
      moneda: 'bolivares',
      metodo_pago: 'Pago Móvil',
      total_usd: 215,
      total_bs: 9578.25,
      items: [
        { descripcion: 'Dior Sauvage EDT 100ml', cantidad: 2, precio_unit_usd: 100, precio_unit_bs: 4455 },
        { descripcion: 'Decant Dior Sauvage EDT 10ml', cantidad: 1, precio_unit_usd: 12, precio_unit_bs: 534.6 },
      ],
    })
    expect(msg).toContain('Pedido #1001')
    expect(msg).toContain('2 × Dior Sauvage EDT 100ml')
    expect(msg).toMatch(/Total: Bs\. 9\.?578,25/)
    expect(msg).toContain('Pago: Pago Móvil, en bolívares')
    expect(msg).toContain('Delivery — Calle 1')
    expect(linkWhatsapp('+58 412-123-4567', msg)).toMatch(/^https:\/\/wa\.me\/584121234567\?text=/)
  })
})

// Un reporte "realista": título arriba, encabezados en la fila 3, totales al final.
const reporte: Celda[][] = [
  ['Reporte de inventario - Tienda', null, null, null, null, null],
  ['Generado: 09/10/2026', null, null, null, null, null],
  ['Código', 'Producto', 'Marca', 'Existencia', 'Precio Bs.', 'Precio USD'],
  ['00123', 'Sauvage EDT 100ml', 'Dior', 5, '4.050,00', 100],
  [' a-77 ', 'Good Girl 80ml', 'Carolina Herrera', '2', '3.645,00', '90,00'],
  [null, 'Bleu de Chanel 100ml', 'Chanel', 3, null, 120],
  ['N-1', 'Perfume Nuevo', 'Marca X', 4, null, 50],
  ['B-9', 'Sin stock válido', 'X', 'n/a', null, 10],
  ['00123', 'Duplicado', 'X', 1, null, 1],
  [null, null, null, null, null, null],
  [null, 'TOTAL', null, 15, null, null],
]

describe('importador del sistema administrativo', () => {
  it('encuentra encabezados y sugiere el mapeo sin confundir precio Bs con USD', () => {
    const i = detectarEncabezado(reporte)
    expect(i).toBe(2)
    const cab = encabezados(reporte, i)
    const m = sugerirMapeo(cab)
    expect(m).toMatchObject({ codigo: 'Código', nombre: 'Producto', marca: 'Marca', stock: 'Existencia', precio_usd: 'Precio USD' })
    expect(mapeoValido(m, cab)).toBe(true)
    expect(mapeoValido({ ...m, stock: 'Columna que ya no existe' }, cab)).toBe(false)
  })

  it('extrae filas, ignora vacías y totales, reporta errores', () => {
    const cab = encabezados(reporte, 2)
    const { filas, errores } = extraerFilas(reporte, 2, sugerirMapeo(cab))
    expect(filas.map((f) => f.codigoNorm)).toEqual(['00123', 'A-77', null, 'N-1', '00123'])
    expect(filas[1]).toMatchObject({ stock: 2, precio_usd: 90 })
    expect(errores).toEqual([{ fila: 8, motivo: 'Stock no válido: "n/a"' }])
  })

  it('planifica: por código, por nombre, nuevos, revisión, ocultos y duplicados', () => {
    const cab = encabezados(reporte, 2)
    const { filas } = extraerFilas(reporte, 2, sugerirMapeo(cab))
    const existentes: ProductoExistente[] = [
      { id: 'p1', nombre: 'Sauvage EDT 100ml', codigo_sistema: '123'.padStart(5, '0'), estado: 'publicado', en_ultimo_reporte: true },
      { id: 'p2', nombre: 'Good Girl Carolina Herrera 80ml', codigo_sistema: 'A-77', estado: 'publicado', en_ultimo_reporte: true },
      { id: 'p3', nombre: 'Bleu de Chanel 100ml', codigo_sistema: null, estado: 'oculto', en_ultimo_reporte: false },
      { id: 'p4', nombre: 'Perfume Viejo', codigo_sistema: 'OLD', estado: 'publicado', en_ultimo_reporte: true },
      { id: 'p5', nombre: 'Perfume Nuevo Edicion', codigo_sistema: null, estado: 'borrador', en_ultimo_reporte: true },
    ]
    const plan = planificarImportacion(filas, existentes)

    expect(plan.actualizar.map((a) => [a.id, a.por])).toEqual([
      ['p1', 'codigo'],
      ['p2', 'codigo'],
      ['p3', 'nombre'],
    ])
    expect(plan.actualizar.find((a) => a.id === 'p3')?.reactivar).toBe(true)
    // "Perfume Nuevo" (con código N-1) se parece a p5 (sin código): va a revisión, no se vincula solo.
    expect(plan.revisar).toHaveLength(1)
    expect(plan.revisar[0]).toMatchObject({ candidatoId: 'p5', motivo: 'Nombre parecido' })
    expect(plan.nuevos).toHaveLength(0)
    expect(plan.errores).toEqual([{ fila: 9, motivo: 'Código repetido en el reporte: 00123' }])
    // p4 no vino en el reporte; p5 está en revisión, no se oculta.
    expect(plan.ocultar).toEqual([{ id: 'p4', nombre: 'Perfume Viejo' }])
  })

  it('no oculta nada si el reporte parece incompleto', () => {
    const existentes: ProductoExistente[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`, nombre: `Perfume ${i}`, codigo_sistema: `C${i}`, estado: 'publicado' as const, en_ultimo_reporte: true,
    }))
    const plan = planificarImportacion(
      [{ fila: 2, codigo: 'C1', codigoNorm: 'C1', nombre: 'Perfume 1', nombreNorm: 'perfume 1', marca: null, stock: 1, precio_usd: 1 }],
      existentes,
    )
    expect(plan.ocultar).toHaveLength(0)
    expect(plan.avisos[0]).toMatch(/no se ocultará ninguno/)
  })

  it('lee XLSX reales', async () => {
    const libro = new ExcelJS.Workbook()
    libro.addWorksheet('Inventario').addRows([['Código', 'Producto', 'Stock'], ['00123', 'Sauvage', 5]])
    const { filas } = await leerXlsx((await libro.xlsx.writeBuffer()) as ArrayBuffer)
    expect(filas[0]).toEqual(['Código', 'Producto', 'Stock'])
    expect(filas[1]).toEqual(['00123', 'Sauvage', 5])
  })
})

describe('tasa BCV', () => {
  // Fragmento real de www.bcv.org.ve (octubre 2026): la tasa publicada en la tarde rige desde el día hábil siguiente.
  const paginaBcv = `<div id="euro"><strong> 1.024,12345678 </strong></div>
          <div id="dolar" class="col-sm-12 col-xs-12 ">
	<div class="field-content">
  		<div class="row recuadrotsmc">
			<div class="col-sm-6 col-xs-6">
  			<img src="/sites/default/files/dollar-04_2.png" class="icono_bss_blanco1">
  		        <span> USD</span>	 </div>
                         <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb">877,90230000</strong>  </div>
	        </div>
        </div>
</div>
          <div class="pull-right dinpro center">
Fecha Valor: <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-10-14T00:00:00-04:00">Miércoles, 14 Octubre  2026</span>
<hr>`

  it('lee la tasa del dólar y la fecha valor de la página del BCV', () => {
    expect(parsearTasaBcv(paginaBcv)).toEqual({ tasa: 877.9023, fechaValor: '2026-10-14' })
  })
  it('acepta <strong> sin atributos y separador de miles', () => {
    const html = '<div id="dolar"><strong> 1.040,50123456 </strong></div> Fecha Valor: <span content="2026-01-05T00:00:00-04:00">Lunes</span>'
    expect(parsearTasaBcv(html)).toEqual({ tasa: 1040.5012, fechaValor: '2026-01-05' })
  })
  it('rechaza valores absurdos o páginas incompletas', () => {
    const fecha = 'Fecha Valor: <span content="2026-10-14T00:00:00-04:00">'
    expect(() => parsearTasaBcv(`<div id="dolar"><strong>0,00</strong></div>${fecha}`)).toThrow()
    expect(() => parsearTasaBcv(`<div id="dolar"><strong>1.000.000,00</strong></div>${fecha}`)).toThrow()
    expect(() => parsearTasaBcv('<div id="dolar"><strong>40,50</strong></div>')).toThrow(/fecha valor/)
    expect(() => parsearTasaBcv('<div id="dolar"><strong>40,50</strong></div>Fecha Valor: <span content="2026-02-30">')).toThrow()
    expect(() => parsearTasaBcv('<html>mantenimiento</html>')).toThrow()
  })
  it('lee la respuesta de DolarAPI como respaldo', () => {
    const datos = { moneda: 'USD', fuente: 'oficial', compra: null, venta: null, promedio: 876.7976, fechaActualizacion: '2026-10-13T00:00:00-04:00' }
    expect(parsearTasaDolarApi(datos)).toEqual({ tasa: 876.7976, fechaValor: '2026-10-13' })
    expect(() => parsearTasaDolarApi({ ...datos, promedio: 0 })).toThrow()
    expect(() => parsearTasaDolarApi({ ...datos, promedio: null })).toThrow()
    expect(() => parsearTasaDolarApi({ promedio: 876.8 })).toThrow(/fecha/)
    expect(() => parsearTasaDolarApi(null)).toThrow()
  })
})

describe('pedidos web', () => {
  it('mes en hora de Caracas', () => {
    // 2 de noviembre 02:00 UTC = 1 de noviembre 22:00 en Caracas; 1 de noviembre 03:00 UTC = 31 de octubre.
    expect(mesActual(new Date('2026-11-02T02:00:00Z'))).toBe('2026-11')
    expect(mesActual(new Date('2026-11-01T03:00:00Z'))).toBe('2026-10')
    expect(rangoMes('2026-12')).toEqual({ desde: '2026-12-01T00:00:00-04:00', hasta: '2027-01-01T00:00:00-04:00' })
    expect(desplazarMes('2026-01', -1)).toBe('2025-12')
    expect(nombreMes('2026-10')).toBe('Octubre de 2026')
    expect(mesValido('2026-13')).toBe(false)
    expect(mesValido(undefined)).toBe(false)
    expect(mesValido('2026-09')).toBe(true)
  })
  it('resumen del mes: cantidad, total y más pedidos', () => {
    const r = resumenMes([
      { total_usd: '120.50', pedido_items: [{ descripcion: 'Sauvage 100ml', cantidad: 1 }, { descripcion: 'Decant Good Girl 5ml', cantidad: 3 }] },
      { total_usd: 80, pedido_items: [{ descripcion: 'Sauvage 100ml', cantidad: 2 }, { descripcion: 'Aventus 50ml', cantidad: 1 }] },
    ], 2)
    expect(r.cantidad).toBe(2)
    expect(r.totalUsd).toBe(200.5)
    expect(r.top).toEqual([{ descripcion: 'Decant Good Girl 5ml', cantidad: 3 }, { descripcion: 'Sauvage 100ml', cantidad: 3 }])
    expect(resumenMes([])).toEqual({ cantidad: 0, totalUsd: 0, top: [] })
  })
  it('teléfono del cliente para wa.me', () => {
    expect(telefonoInternacional('0412 123 4567')).toBe('584121234567')
    expect(telefonoInternacional('412-1234567')).toBe('584121234567')
    expect(telefonoInternacional('+58 412 123 4567')).toBe('584121234567')
    expect(telefonoInternacional('+1 305 555 0100')).toBe('13055550100')
    expect(telefonoInternacional('123')).toBeNull()
  })
})

describe('importación rápida desde el sistema administrativo', () => {
  const seguro = { mapeoGuardadoValido: true, avisos: [], ocultar: 3, activos: 400 }

  it('aplica solo cuando es seguro', () => {
    expect(decidirAplicacion(seguro)).toEqual({ automatico: true })
    // Límite: 10 productos o el 5 % de los activos, lo que sea mayor.
    expect(limiteOcultar(100)).toBe(10)
    expect(limiteOcultar(400)).toBe(20)
    expect(decidirAplicacion({ ...seguro, ocultar: 20 })).toEqual({ automatico: true })
    expect(decidirAplicacion({ ...seguro, activos: 50, ocultar: 10 })).toEqual({ automatico: true })
  })

  it('pide revisar cuando no es seguro, explicando por qué', () => {
    const muchos = decidirAplicacion({ ...seguro, ocultar: 45 })
    expect(muchos).toEqual({ automatico: false, motivo: 'Se ocultarían 45 productos; confirma que el reporte esté completo.' })
    expect(decidirAplicacion({ ...seguro, activos: 50, ocultar: 11 }).automatico).toBe(false)
    expect(decidirAplicacion({ ...seguro, avisos: ['Solo 3 de 400 productos activos aparecen'] })).toMatchObject({ automatico: false, motivo: expect.stringMatching(/incompleto/) })
    expect(decidirAplicacion({ ...seguro, mapeoGuardadoValido: false })).toMatchObject({ automatico: false, motivo: expect.stringMatching(/columnas/) })
  })

  it('reconoce un reporte idéntico al último importado', async () => {
    const a = new TextEncoder().encode('reporte de inventario').buffer as ArrayBuffer
    const b = new TextEncoder().encode('reporte de inventario.').buffer as ArrayBuffer
    const hashA = await hashArchivo(a)
    expect(hashA).toMatch(/^[0-9a-f]{64}$/)
    expect(hashA).toBe(await hashArchivo(a.slice(0)))
    expect(esRepetido(hashA, hashA)).toBe(true)
    expect(esRepetido(await hashArchivo(b), hashA)).toBe(false)
    expect(esRepetido(hashA, null)).toBe(false)
  })

  it('resume el resultado en una línea', () => {
    expect(textoResultado({ actualizados: 132, nuevos: 3, porRevisar: 2, ocultados: 0 })).toBe('Listo. 132 productos actualizados, 3 nuevos en borrador, 2 por revisar.')
    expect(textoResultado({ actualizados: 1, nuevos: 0, porRevisar: 0, ocultados: 1 })).toBe('Listo. 1 producto actualizado, 1 oculto por no venir en el reporte.')
  })
})

describe('fichas con IA', () => {
  // Respuesta de ejemplo de Gemini con responseMimeType "application/json".
  const respuesta = JSON.stringify({
    marca_sugerida: 'Lattafa',
    nombre_sugerido: 'Khamrah',
    confianza: 'alta',
    descripcion: 'Dulce, especiado y envolvente. Canela y dátiles sobre una base de vainilla que dura horas.',
    momento: 'noche',
    temporadas: ['otono', 'invierno', 'monzon'],
    ocasion: ['Citas', 'Eventos', 'Día', 'Fiesta'],
    notas_salida: ['Canela', 'Nuez moscada', 'Bergamota'],
    notas_corazon: ['Dátiles', 'Praliné', 'Nardo'],
    notas_fondo: ['Vainilla', 'Haba tonka', 'Canela'],
    familia_olfativa: 'Oriental especiada',
    genero: 'unisex',
  })

  it('acepta una ficha completa y descarta valores fuera de lista', () => {
    const f = validarFicha(respuesta)
    expect(f.marca_sugerida).toBe('Lattafa')
    expect(f.nombre_sugerido).toBe('Khamrah')
    expect(f.confianza).toBe('alta')
    expect(f.seguro).toBe(true)
    expect(f.momento).toBe('noche')
    expect(f.temporadas).toEqual(['otono', 'invierno'])
    expect(f.ocasion).toEqual(['Citas', 'Eventos'])
    expect(f.notas_salida).toEqual(['Canela', 'Nuez moscada', 'Bergamota'])
    expect(f.familia_olfativa).toBe('Oriental especiada')
    expect(f.genero).toBe('unisex')
    // Unión de las tres capas, sin repetir.
    expect(f.notas).toEqual(['Canela', 'Nuez moscada', 'Bergamota', 'Dátiles', 'Praliné', 'Nardo', 'Vainilla', 'Haba tonka'])
  })

  it('sin confianza alta no deja notas ni familia, aunque la IA las mande', () => {
    for (const confianza of ['media', 'baja', 'altísima', undefined]) {
      const f = validarFicha(JSON.stringify({ ...JSON.parse(respuesta), confianza }))
      expect(f.seguro).toBe(false)
      expect([f.notas_salida, f.notas_corazon, f.notas_fondo, f.notas]).toEqual([[], [], [], []])
      expect(f.familia_olfativa).toBeNull()
      expect(f.confianza).toBe(confianza === 'media' ? 'media' : 'baja')
    }
  })

  it('tolera texto alrededor del JSON y rechaza fichas sin descripción', () => {
    expect(validarFicha('Aquí va:\n```json\n' + respuesta + '\n```').nombre_sugerido).toBe('Khamrah')
    expect(() => validarFicha('{"confianza": "alta"}')).toThrow()
    expect(() => validarFicha('no sé')).toThrow()
    const raro = validarFicha('{"descripcion": "Body spray fresco.", "momento": "tarde", "marca_sugerida": "  ", "genero": "niño"}')
    expect([raro.momento, raro.marca_sugerida, raro.genero, raro.confianza]).toEqual([null, null, null, 'baja'])
  })

  it('normaliza tildes, mayúsculas y sinónimos y descarta lo que la base no acepta', () => {
    const f = validarFicha(JSON.stringify({
      marca_sugerida: '  Lattafa\u0000 ',
      nombre_sugerido: 'null',
      confianza: 'ALTA',
      descripcion: '  Dulce   y especiado.\u0000 ',
      momento: 'Día y Noche',
      temporadas: ['Otoño', 'INVIERNO', 'winter', 'monzón', 7, null],
      ocasion: 'citas, OFICINA, Fiesta, constructor',
      notas_salida: ['Canela', 'canela', ' ', 'Bergamota', { nota: 'x' }],
      notas_corazon: 'Dátiles, Praliné',
      notas_fondo: null,
      familia_olfativa: 'Oriental',
      genero: 'Masculino',
    }))
    expect(f.marca_sugerida).toBe('Lattafa')
    expect(f.nombre_sugerido).toBeNull()
    expect(f.confianza).toBe('alta')
    expect(f.descripcion).toBe('Dulce y especiado.')
    expect(f.momento).toBe('ambos')
    expect(f.temporadas).toEqual(['otono', 'invierno'])
    expect(f.ocasion).toEqual(['Citas', 'Oficina'])
    expect(f.notas_salida).toEqual(['Canela', 'Bergamota'])
    expect(f.notas_corazon).toEqual(['Dátiles', 'Praliné'])
    expect(f.notas_fondo).toEqual([])
    expect(f.genero).toBe('hombre')
    // Todo lo que queda cabe en los check de la migración 0008.
    expect(['dia', 'noche', 'ambos', null]).toContain(f.momento)
    expect(['hombre', 'mujer', 'unisex', null]).toContain(f.genero)
    expect(['alta', 'media', 'baja']).toContain(f.confianza)
    const otro = validarFicha('{"descripcion": "Fresco.", "momento": "DIA", "genero": "toString", "confianza": "Media ", "temporadas": "verano"}')
    expect([otro.momento, otro.genero, otro.confianza, otro.temporadas]).toEqual(['dia', null, 'media', ['verano']])
  })

  it('arma el pedido solo con los datos que existen', () => {
    const t = pedidoFicha({ nombre: 'khamrah clasico', ml: 100, origenFoto: 'Lattafa Khamrah EDP' }, true)
    expect(t).toContain('"khamrah clasico"')
    expect(t).toContain('100 ml')
    expect(t).toContain('Lattafa Khamrah EDP')
    expect(t).toContain('Se adjunta la foto')
    expect(pedidoFicha({ nombre: 'locion', ml: null }, false)).not.toContain('web anterior')
  })

  it('guarda en borrador y respeta género y ocasiones ya puestos', () => {
    const f = validarFicha(respuesta)
    const c = cambiosPorFicha({ genero: 'hombre', ocasion: ['Oficina'], notas: ['Viejas'] }, f)
    expect(c.descripcion_estado).toBe('borrador')
    expect(c.genero).toBe('hombre')
    expect(c.ocasion).toEqual(['Oficina'])
    expect(c.notas).toEqual(f.notas)
    expect(c.ia_confianza).toBe('alta')
    const vacio = cambiosPorFicha({ genero: null, ocasion: [], notas: ['Viejas'] }, validarFicha(JSON.stringify({ ...JSON.parse(respuesta), confianza: 'baja' })))
    expect(vacio.genero).toBe('unisex')
    expect(vacio.ocasion).toEqual(['Citas', 'Eventos'])
    expect(vacio.notas).toEqual(['Viejas'])
  })
})

describe('lote de fichas en segundo plano', () => {
  it('cuenta solo los errores seguidos de la IA', () => {
    const errorIA = { tipo: 'error', nombre: 'X', mensaje: 'La IA respondió con error 503 (tras 3 reintentos)', origen: 'ia' } as const
    let n = 0
    for (let i = 0; i < MAX_ERRORES_SEGUIDOS - 1; i++) n = erroresSeguidos(n, errorIA)
    expect(n).toBe(MAX_ERRORES_SEGUIDOS - 1)
    // Un producto que ya tenía ficha no corta ni suma la racha; uno bien hecho o un error al guardar la reinician.
    expect(erroresSeguidos(n, { tipo: 'omitido' })).toBe(n)
    expect(erroresSeguidos(n, errorIA)).toBe(MAX_ERRORES_SEGUIDOS)
    expect(erroresSeguidos(n, { tipo: 'ok', nombre: 'X', confianza: 'alta' })).toBe(0)
    expect(erroresSeguidos(n, { tipo: 'error', nombre: 'X', mensaje: 'No se guardó', origen: 'guardar' })).toBe(0)
  })

  it('muestra el error real de la base', () => {
    expect(textoErrorBase({ message: 'new row violates check constraint "productos_momento_check"', code: '23514', details: 'Failing row contains (…)', hint: null }))
      .toBe('new row violates check constraint "productos_momento_check" · código 23514 · Failing row contains (…)')
    expect(textoErrorBase({ message: 'permission denied', code: '42501', hint: 'Revisa RLS' })).toBe('permission denied · código 42501 · pista: Revisa RLS')
  })
})
