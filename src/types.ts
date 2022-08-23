/* eslint-disable @typescript-eslint/ban-ts-ignore, @typescript-eslint/explicit-function-return-type */

import * as validator from 'fastest-validator'
import * as graphql from 'graphql'

import { convertForUpdate } from './validation'
import { TSortDirection } from './enum'

/** Entfernt die Markierung einer Typdefinition als optional. */
type XOmitNullable<T> = T extends infer T1 & { nullable?: never } ? T1 : T

/** Ermittelt zu einer Typdefinition den zugehörigen JavaScript Datentyp. */
export type TGqlType<TGql> = XOmitNullable<TGql> extends GqlRecord<infer TItem, infer TLayout, infer TFilter>
    ? TItem
    : XOmitNullable<TGql> extends GqlBase<infer TItem, infer TFilter, infer TLayout>
    ? TItem
    : never

/** Die Arten von Filterbedingungen. */
export type TGqlFilterTypes = 'string' | 'int' | 'float' | 'boolean' | 'enum' | 'object' | 'unknown'

/** Ermittelt zu einer Typdefinition die zugehörige Filterbeschreibung. */
export type TGqlFilterType<TGql> = XOmitNullable<TGql> extends GqlRecord<infer TItem, infer TLayout, infer TFilter>
    ? TFilter
    : XOmitNullable<TGql> extends GqlBase<infer TItem, infer TFilter, infer TLayout>
    ? TFilter
    : never

/** Ermittelt zu einer Typdefinition die zugehörige Filterbeschreibung. */
export type TGqlLayoutType<TGql> = XOmitNullable<TGql> extends GqlRecord<infer TItem, infer TLayout, infer TFilter>
    ? TLayout
    : XOmitNullable<TGql> extends GqlBase<infer TItem, infer TFilter, infer TLayout>
    ? TLayout
    : never

/** Basisklasse für die Optionen aller Datentypen. */
export interface IGqlOptionsCommon<TValidation> {
    /** Für berechnete Felder gesetzt - diese können werden beim Anlegen noch beim Ändern explizit überschrieben werden. */
    computed?: boolean
    /** Gesetzt, wenn nach dem Feld sortiert werden kann. */
    sortable?: boolean
    /** Eine optionale Beschreibung für den GraphQL Typ. */
    description?: string
    /** Optional die zugehörigen Prüfinformationen - es wird immer eine Prüfung auf den JavaScript Datentyp eingestellt. */
    validation?: TValidation
}

/** Basisklasse für alle Typdefinitionen. */
export class GqlBase<TItem, TFilter extends TGqlFilterTypes, TLayout = unknown> {
    constructor(
        options: Omit<IGqlOptionsCommon<validator.RuleCustom>, 'sortable'>,
        sortable: boolean | string[],
        graphQLType: graphql.GraphQLOutputType,
        graphQLInputType: graphql.GraphQLInputType,
        graphQLUpdateType: graphql.GraphQLInputType
    )

    constructor(
        options: Omit<IGqlOptionsCommon<validator.RuleCustom>, 'sortable'>,
        sortable: boolean | string[],
        graphQLType: graphql.GraphQLEnumType | graphql.GraphQLScalarType
    )

    constructor(
        public readonly options: Omit<IGqlOptionsCommon<validator.RuleCustom>, 'sortable'>,
        public readonly sortable: boolean | string[],
        protected readonly _graphQLType:
            | graphql.GraphQLEnumType
            | graphql.GraphQLOutputType
            | graphql.GraphQLScalarType,
        protected readonly _graphQLInputType?: graphql.GraphQLInputType,
        protected readonly _graphQLUpdateType?: graphql.GraphQLInputType
    ) {
        if (!options.validation) {
            options.validation = {} as validator.RuleBoolean
        }

        if (!(_graphQLType instanceof graphql.GraphQLScalarType)) {
            if (!(_graphQLType instanceof graphql.GraphQLEnumType)) {
                return
            }
        }

        if (!_graphQLInputType) {
            this._graphQLInputType = _graphQLType
        }

        if (!_graphQLUpdateType) {
            this._graphQLUpdateType = _graphQLType
        }
    }

    /** Platzhalter für den zugehörigen JavaScript Datentyp. */
    // @ts-ignore
    private readonly _type?: TItem

    /** Platzhalter für die zugehörige Filterbeschreibung. */
    // @ts-ignore
    private readonly _filterType?: TFilter

    /** Hilfsfeld zum Zugriff auf die Struktur des Objektes. */
    // @ts-ignore
    private readonly _layoutType?: TLayout

    /** Der volle GraphQL Datentyp - als NonNull wenn die Prüfinformationen den Wert als optional anzeigen. */
    get outputType(): graphql.GraphQLOutputType {
        return this.options.validation?.optional ? this._graphQLType : new graphql.GraphQLNonNull(this._graphQLType)
    }

    /** Der Datentyp zum Anlegen neuer Informationen - als NonNull wenn die Prüfinformationen den Wert als optional anzeigen. */
    get inputType(): graphql.GraphQLInputType {
        return this.options.validation?.optional
            ? this._graphQLInputType
            : new graphql.GraphQLNonNull(this._graphQLInputType)
    }

    /** Der Datentyp zum Ändern von Informationen - wird immer als optional gemeldet, i.e. ist niemals NonNull. */
    get updateType(): graphql.GraphQLInputType {
        const updateType = this._graphQLUpdateType

        return updateType instanceof graphql.GraphQLNonNull ? updateType.ofType : updateType
    }

    /** Meldet sämtliche Prüfinformationen für diese Typdefinition - da im Moment der fastest-validator leider nur ein OR kann bleibt es erst einmal bei der einen. */
    get validations(): validator.RuleCustom[] {
        return [this.options.validation]
    }
}

/** Hilfsdefinition zur Einstellung von Prüfinformationen ohne den Zwang auch die Art der Prüfung mit anzugeben. */
type TRelaxedRule<TRule, TRuleType extends string> = { [field in keyof TRule]?: TRule[field] } & { type?: TRuleType }

/** Beschreibung der Prüfinformationen für eine bestimmte Typdefinition. */
export interface IGqlOptions<TRule, TRuleType extends string>
    extends IGqlOptionsCommon<TRelaxedRule<TRule, TRuleType>> {}

/** Typdefinition für eine Zeichenkette. */
export function GqlString(
    options?:
        | IGqlOptions<validator.RuleEmail, 'email'>
        | IGqlOptions<validator.RuleEnum<string>, 'enum'>
        | IGqlOptions<validator.RuleMac, 'mac'>
        | IGqlOptions<validator.RuleString, 'string'>
        | IGqlOptions<validator.RuleURL, 'url'>
        | IGqlOptions<validator.RuleUUID, 'uuid'>
) {
    return new GqlBase<string, 'string'>(
        {
            ...options,
            validation: { type: 'string', ...options?.validation },
        },
        options?.sortable === true,
        graphql.GraphQLString
    )
}

/** Typdefinition für eine eindeutige Kennung. */
export function GqlId(options?: IGqlOptions<validator.RuleString, 'string'>) {
    return new GqlBase<string, 'string'>(
        {
            ...options,
            validation: { ...options?.validation, empty: false, type: 'string' },
        },
        options?.sortable === true,
        graphql.GraphQLID
    )
}

/** Typdefinition für eine Auflistung - nicht ganz unkritisch in der Nutzung, muss vermutlich überarbeitet werden. */
export function GqlEnum<TKey extends string, TValue>(
    name: string,
    enumDef: Record<TKey, TValue>,
    options?: IGqlOptions<validator.RuleEnum<string>, 'enum'>
) {
    /** Alle Zuordnungen von internen Namen zu tatsächlichen Werten aufbauen. */
    const values: graphql.GraphQLEnumValueConfigMap = {}

    let isString = true

    for (const key in enumDef) {
        const value = enumDef[key]

        if (typeof value !== 'string') {
            isString = false
        }

        values[key] = { value }
    }

    /** Wenn der Werteberich nicht aus Zeichenketten besteht müssen die Rückabbildungen entfernt werden - man schaue sich dazu an, wie TypeScript enum umsetzt. */
    if (!isString) {
        for (const key of Object.keys(values)) {
            if (typeof values[key].value === 'string') {
                delete values[key]
            }
        }
    }

    /** Jetzt kann die Typdefinition erstellt werden. */
    const type = new graphql.GraphQLEnumType({ description: options?.description, name, values })

    return new GqlBase<TValue | TKey, 'enum'>(
        {
            ...options,
            validation: {
                ...options?.validation,
                type: 'enum',
                values: Object.keys(values).map((k) => values[k].value),
            },
        },
        options?.sortable === true,
        type
    )
}

/** Typdefinition für eine ganze Zahl. */
export function GqlInt(
    options?: IGqlOptions<validator.RuleEnum<number>, 'number'> | IGqlOptions<validator.RuleNumber, 'number'>
) {
    return new GqlBase<number, 'int'>(
        {
            ...options,
            validation: { ...options?.validation, integer: true, type: 'number' },
        },
        options?.sortable === true,
        graphql.GraphQLInt
    )
}

/** Typdefinition für eine Fließkommazahl. */
export function GqlFloat(options?: IGqlOptions<validator.RuleNumber, 'number'>) {
    return new GqlBase<number, 'float'>(
        {
            ...options,
            validation: { ...options?.validation, integer: false, type: 'number' },
        },
        options?.sortable === true,
        graphql.GraphQLFloat
    )
}

/** Typdefinition für einen Wahrheitswert. */
export function GqlBoolean(options?: IGqlOptions<validator.RuleBoolean, 'boolean'>) {
    return new GqlBase<boolean, 'boolean'>(
        {
            ...options,
            validation: { ...options?.validation, type: 'boolean' },
        },
        options?.sortable === true,
        graphql.GraphQLBoolean
    )
}

/** Typdefinition für ein Feld. */
export function GqlArray<TItem, TFilter extends TGqlFilterTypes, TLayout, T extends GqlBase<TItem, TFilter, TLayout>>(
    item: T,
    options?: Omit<IGqlOptions<validator.RuleArray, 'array'>, 'sortable'>
) {
    /** Typdefinition anlegen und vor allem die Prüfungen auf die Kindelement ausdehnen. */
    return new GqlBase<TGqlType<T>[], TGqlFilterType<T>, TGqlLayoutType<T>>(
        {
            ...options,
            validation: { ...options?.validation, items: item.validations, type: 'array' },
        },
        item.sortable,
        new graphql.GraphQLList(item.outputType),
        new graphql.GraphQLList(item.inputType),
        new graphql.GraphQLList(item.inputType)
    )
}

/** Markiert eine Typdefinition als optional - auch muss nachgearbeitet werden, da die eigentliche Typdefinition eigebtlich nicht verändert werden sollte. */
export function GqlNullable<
    TItem,
    TFilter extends TGqlFilterTypes,
    TLayout,
    TGql extends GqlBase<TItem, TFilter, TLayout>
>(item: TGql) {
    /** Es ist erlaubt, keine innere Typdefinition anzugeben. */
    if (item) {
        /** Im Parameter angegebene Typdefinition modifizieren. */
        const validation = item.options.validation

        if (validation) {
            validation.optional = true
        }
    }

    /** Existierende Typdefinition melden - es wird keine neue angelegt, das ist sicher nicht ganz unkritisch, wird aber meistens passen. */
    return item as TGql & { nullable?: never }
}

/** Filtert alle optionalen Eigenschaften. */
type TGetNullable<TLayout> = {
    [field in keyof TLayout]: TLayout[field] extends { nullable?: never } ? field : never
}[keyof TLayout]

/** Filtert alle zwingenden Eigenschaften. */
type TGetNonNullable<TLayout> = {
    [field in keyof TLayout]: TLayout[field] extends { nullable?: never } ? never : field
}[keyof TLayout]

/** Extrahiert aus einer Typdefinition eines Objektes nur die optionalen Felder. */
type TObjectNullable<TLayout> = {
    [field in TGetNullable<TLayout>]?: TGqlType<TLayout[field]>
}

/** Extrahiert aus einer Typdefinition eines Objektes nur die zwingenden Felder. */
type TObjectNonNullable<TLayout> = {
    [field in TGetNonNullable<TLayout>]: TGqlType<TLayout[field]>
}

/** Erstellt aus einer Typdefinition eines Objektes eine JavaScript Beschreibung mit optionalen und zwingenden Feldern. */
export type TGqlObject<TLayout> = TObjectNullable<TLayout> & TObjectNonNullable<TLayout>

/** Hilfsklasse zum Sammeln von GraphQL Typen. */
interface INamedTypeMap {
    [name: string]: graphql.GraphQLNamedType
}

/** Ermittelt alle referenzierten GraphQL Typen. */
function getNamedTypes(root: graphql.GraphQLType, types: INamedTypeMap): void {
    if (root instanceof graphql.GraphQLNonNull) {
        getNamedTypes(root.ofType, types)
    } else if (root instanceof graphql.GraphQLList) {
        getNamedTypes(root.ofType, types)
    } else if (root instanceof graphql.GraphQLEnumType) {
        types[root.name] = root
    } else if (root instanceof graphql.GraphQLObjectType || root instanceof graphql.GraphQLInputObjectType) {
        /** Jeder GraphQL Typ darf nur einmal vorkommen - sonst können wir in einem Zyklus landen. */
        if (types[root.name]) {
            return
        }

        /** Das sind wir selbst. */
        types[root.name] = root

        /** Und hier geht es dann rekursiv in die Tiefe - nicht optimal aber einfach. */
        const fields = root.getFields()

        for (const field in fields) {
            getNamedTypes(fields[field].type, types)
        }
    }
}

/** Hilfsklasse zur Beschreibung von Typdefinitionen von reinen (DTO) Objekten. */
export class GqlRecord<TItem, TLayout, TFilter extends TGqlFilterTypes = 'object'> extends GqlBase<
    TItem,
    TFilter,
    TLayout
> {
    /** Der ursprüngliche GraphQL Typ zum Anlegen neuer Informationen. */
    get graphQLInputType(): graphql.GraphQLInputObjectType {
        return this._graphQLInputType as graphql.GraphQLInputObjectType
    }

    /** Der ursprüngliche GraphQL Typ zum Ändern existierender Informationen. */
    get graphQLUpdateType(): graphql.GraphQLInputObjectType {
        return this._graphQLUpdateType as graphql.GraphQLInputObjectType
    }

    /** Der ursprüngliche GraphQL Typ. */
    get graphQLType(): graphql.GraphQLObjectType {
        return this._graphQLType as graphql.GraphQLObjectType
    }

    /** Ermittelt alle GraphQL Typen, die direkt oder indirekt referenziert werden. */
    get graphQLTypes(): graphql.GraphQLNamedType[] {
        const types: INamedTypeMap = {}

        getNamedTypes(this._graphQLType, types)
        getNamedTypes(this._graphQLInputType, types)
        getNamedTypes(this._graphQLUpdateType, types)

        return Object.keys(types).map((name) => types[name])
    }

    /** Unsere persönliche Prüfinstanz. */
    private readonly _validator = new validator.default()

    /** Prüfinformationen für das Anlegen neuer Informationen. */
    private _validation: validator.ValidationSchema

    get validation(): validator.ValidationSchema {
        /** Das wollen wir aber nur einmal erstellen. */
        if (!this._validation) {
            /** Elementare Prüfinformationen abrufen. */
            const validation = { ...this.options.validation }

            /** Für ein Prüfschema irrelvante Eigenschaften entfernen. */
            delete validation.properties
            delete validation.strict
            delete validation.type

            /** Die gesondert erstellten Prüfdaten einmischen. */
            this._validation = { ...validation, ...this.options.validation?.properties, $$strict: true }
        }

        return this._validation
    }

    /** Prüfinformationen für das Ändern existierender Informationen. */
    private _updateValidation: validator.ValidationSchema

    get updateValidation(): validator.ValidationSchema {
        /** Einmalig erstellen. */
        if (!this._updateValidation) {
            this._updateValidation = convertForUpdate(this.validation)
        }

        return this._updateValidation
    }

    /** Ein beliebiges Objekt gegen die Prüfregeln validieren. */
    validate(item: TItem, forUpdate?: boolean): validator.ValidationError[] | true {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this._validator.validate(item as any, forUpdate ? this.updateValidation : this.validation) as
            | validator.ValidationError[]
            | true
    }
}

/** Beschreibt die Konfiguration zur Erstellung einer Typdefinition für ein Objekt. */
export interface IGqlObjectLayout {
    [field: string]: GqlBase<unknown, TGqlFilterTypes>
}

/** Hilfsmethode um Feineinstellungen an GraphQL Typen vorzunehmen. */
type TFieldGetter = <TFields>(
    fields: TFields,
    mode: 'type' | 'input' | 'update',
    type: graphql.GraphQLNamedType
) => TFields

/**
 * Erstellt eine Typdefinition für ein Objekt.
 *
 * @param isArgs gesetzt, wenn es sich um die Prüfinformationen für die Parameterliste
 * einer GraphQL Methode handelt. In diesem Fall werden nicht automatisch die Felder auf
 * oberster Ebene auf optional gesetzt, sondern behalten ihre ursprüngliche Konfiguration.
 * @param name optional der Name des GraphQL Typs.
 * @param item Beschreibung der Objektstruktur.
 * @param options Optionale Anppasungen für die Typdefinition.
 * @param noValidation gesetzt um alle Prüfungen zu unterdrücken.
 * @param fieldGetter optionale Feineinstellungen für den GraphQL Typen.
 */
function createObject<TLayout extends IGqlObjectLayout>(
    isArgs: boolean,
    name: string,
    item: TLayout,
    options?: Omit<IGqlOptions<validator.RuleObject, 'object'>, 'sortable'>,
    noValidation?: boolean,
    fieldGetter?: TFieldGetter
) {
    /** Vorgegebene Prüfregeln auslesen. */
    const validation: validator.RuleObject = { ...options?.validation, properties: {}, strict: true, type: 'object' }

    /** Aus der Strukturbeschreibung das GraphQL Layout und die Prüfinformationen erstellen. */
    const inputFields: graphql.GraphQLInputFieldConfigMap = {}
    const updateFields: graphql.GraphQLInputFieldConfigMap = {}
    const fields: graphql.GraphQLFieldConfigMap<unknown, unknown> = {}
    const sort: string[] = []

    for (const field of Object.keys(item)) {
        const gql = item[field as keyof TLayout]

        /** Optionales Feld. */
        if (!gql) {
            continue
        }

        /** Auf jeden Fall ein Feld im GraphQL Typen anlegen. */
        fields[field] = { description: gql.options.description, type: gql.outputType }

        /** Informationen zur Sortierung ergänzen. */
        const sortable = gql.sortable

        if (sortable) {
            if (Array.isArray(sortable)) {
                sort.push(...sortable.map((f) => `${field}.${f}`))
            } else {
                sort.push(field)
            }
        }

        /** Berechnete Fehler werden nicht bei Änderungen berücksichtigt. */
        if (gql.options.computed) {
            continue
        }

        /** Für alle Felder einer Parameterliste sicherstellen, dass diese nicht unerwünscht als optional erscheinen - siehe dazu convertForUpdate. */
        let fieldValidations = gql.validations

        if (isArgs && fieldValidations[0].optional !== true) {
            fieldValidations = [{ ...fieldValidations[0], optional: false }, ...fieldValidations.slice(1)]
        }

        /** Prüfregeln vermerken. */
        validation.properties[field] = fieldValidations

        /** Felder erscheinen immer wie gewünscht beim Anlegen von Informationen. */
        inputFields[field] = { description: gql.options.description, type: gql.inputType }

        /** Beim Ändern sind alle Fehler üblicherweise optional (Ausnahme Parameterliste) - dies auch rekursiv. Ganz richtig ist das sicher auch nicht immer. */
        const updateType = gql.updateType

        updateFields[field] = {
            description: gql.options.description,
            type:
                updateType instanceof graphql.GraphQLNonNull || !isArgs
                    ? updateType
                    : new graphql.GraphQLNonNull(updateType),
        }
    }

    /** Typdefinition anlegen. */
    const description = options?.description

    let type: graphql.GraphQLObjectType

    // eslint-disable-next-line prefer-const
    type = new graphql.GraphQLObjectType({
        description,
        fields: fieldGetter ? () => fieldGetter(fields, 'type', type) : fields,
        name,
    })

    let inputType: graphql.GraphQLInputObjectType

    // eslint-disable-next-line prefer-const
    inputType = new graphql.GraphQLInputObjectType({
        description,
        fields: fieldGetter ? () => fieldGetter(inputFields, 'input', inputType) : inputFields,
        name: `${name}Input`,
    })

    let updateType: graphql.GraphQLInputObjectType

    // eslint-disable-next-line prefer-const
    updateType = new graphql.GraphQLInputObjectType({
        description,
        fields: fieldGetter ? () => fieldGetter(updateFields, 'update', updateType) : updateFields,
        name: `${name}Update`,
    })

    return new GqlRecord<TGqlObject<TLayout>, TLayout, 'object'>(
        { ...options, validation: noValidation ? { type: 'object' } : validation },
        sort.length > 0 && sort,
        type,
        inputType,
        updateType
    )
}

/**
 * Typdefinition für ein Objekt anlegen.
 *
 * @param name GraphQL Name des Typs.
 * @param item Struktur des Objektes.
 * @param options Optionale Feineinstellungen für die Typdefinition.
 * @param noValidation gesetzt um alle Prüfungen zu unterdrücken.
 * @param fieldGetter optionale Feineinstellungen für den GraphQL Typen.
 */
export function GqlObject<TLayout extends IGqlObjectLayout>(
    name: string,
    item: TLayout,
    options?: IGqlOptions<validator.RuleObject, 'object'>,
    noValidation?: boolean,
    fieldGetter?: TFieldGetter
) {
    return createObject(false, name, item, options, noValidation, fieldGetter)
}

/**
 * Typdefinition für eine Parameterliste anlegen.
 *
 * @param item Beschreibung der einzelnen Parameter.
 * @param options Optionale Feineinstellungen für die Typdefinition.
 */
export function GqlArgs<TLayout extends IGqlObjectLayout>(
    item: TLayout,
    options?: IGqlOptions<validator.RuleObject, 'object'>
) {
    return createObject(true, '', item, options)
}

/** Typdefinition für die möglichen Sortierungen. */
export const SortDirection = GqlEnum('SortDirection', TSortDirection)

/**
 * Erstellt eine Typdefinition für die Sortierung nach einer Liste von
 * Feldern.
 *
 * @param type Die Typdefinition für die eine Sortierung erstellt werden soll.
 */
export function GqlSort<TItem, TFilter extends TGqlFilterTypes, TLayout>(type: GqlRecord<TItem, TLayout, TFilter>) {
    /** Das macht nur Sinn, wenn es tatsächlich sortierbare Fehler gibt.*/
    const sortable = type.sortable

    if (!Array.isArray(sortable) || sortable.length < 1) {
        return undefined
    }

    /** Auflistung für die möglichen Fehler erstellen. */
    const enumBase: Record<string, string> = {}

    for (const field of sortable) {
        enumBase[field.replace(/\.(.)/g, (match, char: string) => char.toUpperCase())] = field
    }

    return GqlNullable(
        GqlArray(
            GqlObject(`${type.graphQLType.name}Sort`, {
                direction: SortDirection,
                field: GqlEnum(`${type.graphQLType.name}SortFields`, enumBase),
            })
        )
    )
}
