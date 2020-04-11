/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { RuleCustom } from 'fastest-validator'
import * as graphql from 'graphql'
import { FilterQuery } from 'mongodb'

import * as filterTypes from './filterTypes'
import * as types from './types'

/**
 * Erstellt die GraphQL Filterbeschreibung für einen Typen.
 *
 * @param type der zu untersuchende GraphQL Datentyp.
 * @param outer gesetzt, wenn es sich um einen äußeren Datentyp handelt, der um And und Or ergänzt werden muss.
 * */
export function createObjectFilter(type: graphql.GraphQLObjectType, outer = '') {
    const filter: types.IGqlObjectLayout = {}

    /** Alle Felder durchgehen. */
    const fields = type.getFields()

    for (const name of Object.keys(fields)) {
        const field = fields[name].type

        /** Äußeres GraphQLNull entfernen. */
        const outerType = field instanceof graphql.GraphQLNonNull ? field.ofType : field

        /** Bei Feldern zählt der Elementtyp. */
        const innerType = outerType instanceof graphql.GraphQLList ? outerType.ofType : outerType

        /** GraphQL Typ auf dessen Grundlage der Filter erstellt werden kann. */
        const fieldType = innerType instanceof graphql.GraphQLNonNull ? innerType.ofType : innerType

        /** Filterbedingung anlegen. */
        if (fieldType === graphql.GraphQLString) {
            filter[name] = filterTypes.GqlStringFilter
        } else if (fieldType === graphql.GraphQLInt) {
            filter[name] = filterTypes.GqlIntFilter
        } else if (fieldType === graphql.GraphQLFloat) {
            filter[name] = filterTypes.GqlFloatFilter
        } else if (fieldType === graphql.GraphQLBoolean) {
            filter[name] = filterTypes.GqlBooleanFilter
        } else if (fieldType instanceof graphql.GraphQLObjectType) {
            /** Bei Unterobjekten wird eine entsprechend untergeordnete Beschreibung erstellt. */
            filter[name] = types.GqlNullable(createObjectFilter(fieldType, `${outer}${type.name}`))
        } else if (fieldType instanceof graphql.GraphQLEnumType) {
            /** Aufzählung müssen etwas trickreicher umgesetzt werden. */
            filter[name] = types.GqlNullable(
                types.GqlObject(
                    `${fieldType.name}Filter`,
                    filterTypes.createStandardFilter(
                        (options?: types.IGqlOptionsCommon<RuleCustom>) =>
                            new types.GqlBase<unknown, 'unknown'>(options, false, fieldType)
                    )
                )
            )
        }
    }

    /** Dieser GraphQL bekommt über And und Or einen Selbstbezug und muss etwas anders behandelt werden. Insbesondere wird die semantische Prüfung deaktiviert. */
    const name = `${outer}${type.name}Filter`

    return types.GqlObject(
        name,
        filter,
        undefined,
        true,
        !outer &&
        ((fields, mode, type) => {
            if (mode === 'input' && type.name === `${name}Input`) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const anyFields: any = fields

                anyFields.And = { type: new graphql.GraphQLList(new graphql.GraphQLNonNull(type)) }
                anyFields.Or = { type: new graphql.GraphQLList(new graphql.GraphQLNonNull(type)) }
            }

            return fields
        })
    )
}

/** Erstellt aus einem formalen Filter Parameter die zugehörige MongoDB Beschreibung. */
export function toMongoFilter(gqlFilter: unknown, scope = '', filter: FilterQuery<unknown> = {}): FilterQuery<unknown> {
    for (const field of Object.keys(gqlFilter || {})) {
        /** Das betroffene Feld. */
        const ops = gqlFilter[field as keyof typeof gqlFilter]

        /** Sonderhandlung für logische Operationen. */
        const isAnd = field === 'And'

        if (isAnd || field === 'Or') {
            /** Alle Suchbedingungen auswerten. */
            const subs = (ops || []).map(f => toMongoFilter(f, scope))

            /** Eine Berücksichtigung ist nur notwendig wenn mindestens eine Einschränkung. */
            if (subs.length > 0) {
                filter[isAnd ? '$and' : '$or'] = subs
            }

            continue
        }

        /** Berücksichtigung von Unterobjekten - in MongoDb fast wie normale Felder behandelt, nur durch Punkte hierarchisch getrennt. */
        const fullName = `${scope}${scope ? '.' : ''}${field}`

        /** Zu jedem Feld die Suchoperation übersetzen. */
        const fieldFilter: FilterQuery<unknown> = {}

        for (const op of Object.keys(ops || {})) {
            /** Abhängig vom Namen der Operation im Filter umsetzen. */
            const value = ops[op]

            switch (op as filterTypes.stringOperations) {
                case 'Exists':
                    fieldFilter.$exists = value !== false
                    break
                case 'Eq':
                    fieldFilter.$eq = value
                    break
                case 'Neq':
                    fieldFilter.$ne = value
                    break
                case 'Lt':
                    fieldFilter.$lt = value
                    break
                case 'Lte':
                    fieldFilter.$lte = value
                    break
                case 'Gt':
                    fieldFilter.$gt = value
                    break
                case 'Gte':
                    fieldFilter.$gte = value
                    break
                case 'In':
                    fieldFilter.$in = value || []
                    break
                case 'Nin':
                    fieldFilter.$nin = value || []
                    break
                case 'RegEx':
                    fieldFilter.$regex = value
                    fieldFilter.$options = 'i'
                    break
                default:
                    /** Das ist nicht ganz ohne Risiko funktioniert aber sicher, solange GraphQL Felder niemals großgeschrieben werden. */
                    toMongoFilter(ops, fullName, filter)
                    break
            }
        }

        /** Falls Einschränkungen vorhanden sind diese übernehmen. */
        if (Object.keys(fieldFilter).length > 0) {
            filter[fullName] = fieldFilter
        }
    }

    return filter
}
