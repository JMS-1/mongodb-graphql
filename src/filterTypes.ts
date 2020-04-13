/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as types from './types'

/** Einschränkende Operationen, die für alle Datentypen angeboten werden. */
export type standardOperations = 'Eq' | 'Exists' | 'Gt' | 'Gte' | 'Lt' | 'Lte' | 'Neq' | 'In' | 'Nin' | 'All'

/** Einschränkende Operationen für Zeichenketten. */
export type stringOperations = standardOperations | 'RegEx'

/** Typdefinition für alle einchränkenden Operationen erstellen.
 *
 * @param factory erstellt die Typedefinition für die betroffene Art von Werten.
 */
export function createStandardFilter<TItem, TFilter extends types.TGqlFilterTypes, TLayout, TOptions>(
    factory: (options: types.IGqlOptionsCommon<TOptions>) => types.GqlBase<TItem, TFilter, TLayout>
) {
    return {
        Eq: types.GqlNullable(factory({ description: 'Exakt identisch' })),
        Exists: types.GqlNullable(types.GqlBoolean({ description: 'Ist definiert' })),
        Gt: types.GqlNullable(factory({ description: 'Größer' })),
        Gte: types.GqlNullable(factory({ description: 'Nicht kleiner' })),
        In: types.GqlNullable(types.GqlArray(factory({ description: 'In Liste' }))),
        Lt: types.GqlNullable(factory({ description: 'Kleiner' })),
        Lte: types.GqlNullable(factory({ description: 'Nicht größer' })),
        Neq: types.GqlNullable(factory({ description: 'Nicht identisch' })),
        Nin: types.GqlNullable(types.GqlArray(factory({ description: 'Nicht in Liste' }))),
    }
}

/** Erstellt die Typdefinition für alle Operationen auf Zeichenketten. */
function createStringFilter() {
    return {
        ...createStandardFilter(types.GqlString),
        RegEx: types.GqlNullable(types.GqlString({ description: 'Mustervergleich' })),
    }
}

/** Operationen auf Wahrheitswerten. */
export const GqlBooleanFilter = types.GqlNullable(
    types.GqlObject('BooleanFilter', createStandardFilter(types.GqlBoolean))
)

/** Operationen auf Fließkommazahlen. */
export const GqlFloatFilter = types.GqlNullable(types.GqlObject('FloatFilter', createStandardFilter(types.GqlFloat)))

/** Operationen auf ganzen Zahlen. */
export const GqlIntFilter = types.GqlNullable(types.GqlObject('IntFilter', createStandardFilter(types.GqlInt)))

/** Operationen auf Zeichenketten. */
export const GqlStringFilter = types.GqlNullable(types.GqlObject('StringFilter', createStringFilter()))

/** Die Schnittstellen der Filtertypdefinitionen. */
export type IBoolFilter = types.TGqlType<typeof GqlBooleanFilter>
export type IFloatFilter = types.TGqlType<typeof GqlFloatFilter>
export type IIntFilter = types.TGqlType<typeof GqlIntFilter>
export type IStringFilter = types.TGqlType<typeof GqlStringFilter>

/** Hilfstyp zum Erzeugen der Standardoperationen auf einer Aufzählung. */
type TMakeStandardEnumFilter<TEnum> = {
    [field in keyof IIntFilter]?: IIntFilter[field] extends number
    ? TEnum
    : IIntFilter[field] extends number[]
    ? TEnum[]
    : IIntFilter[field]
}

/** Hilfsklasse zum Erstellen einer Beschreibung eines Filters */
type TGetFilterType<TItem, TFilter, TLayout> = TFilter extends 'string'
    ? IStringFilter
    : TFilter extends 'int'
    ? IIntFilter
    : TFilter extends 'float'
    ? IFloatFilter
    : TFilter extends 'boolean'
    ? IBoolFilter
    : TFilter extends 'enum'
    ? TMakeStandardEnumFilter<TItem>
    : TFilter extends 'object'
    ? { [field in keyof TLayout]?: TGqlFilterHelper<TLayout[field]> }
    : never

/** Erstellt die Beschreibung eines Filters - das mit dem Einmischen der logischen Operationen ist etwas aufwändiger. */
type TGqlFilterHelper<TGql> = TGetFilterType<
    types.TGqlType<TGql>,
    types.TGqlFilterType<TGql>,
    types.TGqlLayoutType<TGql>
>

export type TGqlFilter<TGql> = TGqlFilterHelper<TGql> & { And?: TGqlFilter<TGql>[]; Or?: TGqlFilter<TGql>[] }
