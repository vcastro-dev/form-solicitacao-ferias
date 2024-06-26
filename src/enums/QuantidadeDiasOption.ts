export interface QuantidadeDiasOption {
    options: Period[]
    text: QuantidadeDiasOptionText,
    totalDiasAbono: number,
    totalPeriods: number,
}

interface Period {
    totalDias: number,    
}

export type QuantidadeDiasOptionText = 
    '30 dias de descanso' |
    '20 dias de descanso + 10 dias de descanso' |
    '20 dias de descanso + 10 dias de abono' |
    '15 dias de descanso + 10 dias de abono + 5 dias de descanso' |
    '15 dias de descanso + 15 dias de descanso' |
    '20 dias de descanso + 5 dias de descanso + 5 dias de descanso' |
    '15 dias de descanso + 10 dias de descanso + 5 de descanso'