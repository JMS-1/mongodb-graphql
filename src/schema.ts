import { GraphQLNamedType, GraphQLObjectType, GraphQLFieldConfigMap, GraphQLSchemaConfig } from 'graphql'

import { Collection } from './collection'

import { GqlArgs, GqlObject, GqlString, GqlArray, TGqlType } from './types'

/** Parameterliste für das Abfragen aller Prüfinformationen. */
const validationArgs = GqlArgs('global_args', {})

/** Prüfinformationen für eine einzelne Entität. */
const validationResult = GqlObject('ValidationInformation', {
    input: GqlString(),
    name: GqlString(),
    update: GqlString(),
})

/** Prüfinformationen für alle bekannten Entitäten. */
const validationResults = GqlArray(validationResult)

/**
 * Erstellt eine Konfiguration für ein GraphQL Schema.
 *
 * @param collections alle zu verwendenden Arten von Entitäten in Form ihrer Zugriffsklassen.
 */
export async function createSchemaConfiguration(collections: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [qglName: string]: Promise<Collection<any, any>>
}): Promise<GraphQLSchemaConfig> {
    /** Alle Prüfinformationen. */
    const validations: TGqlType<typeof validationResults> = []

    /** Alle Änderungsoperationen. */
    const mutations: GraphQLFieldConfigMap<unknown, unknown> = {}

    /** Alle Suchoperationen. */
    const queries: GraphQLFieldConfigMap<unknown, unknown> = {
        /** Abfrage aller bekannten Prüfinformationen. */
        validation: {
            args: validationArgs.graphQLInputType.getFields(),
            description: 'Alle Prüfinformationen auslesen.',
            resolve: () => validations,
            type: validationResults.outputType,
        },
    }

    /** Alle bekannten GraphQL Typen - jeder Typ darf nur einmal aufgeführt sein. */
    const types: Record<string, GraphQLNamedType> = {}

    /** Alle Entitäten durchgehen. */
    for (const field of Object.keys(collections)) {
        const collection = await collections[field as keyof typeof collections]
        const { model } = collection

        /** Alle Suchoperationen. */
        const typeQueries = collection.queries.methods

        if (Object.keys(typeQueries).length > 0) {
            queries[field] = typeQueries
        }

        /** Alle Änderungsoperationen. */
        const typeMutations = collection.mutations.methods

        if (Object.keys(typeMutations).length > 0) {
            mutations[field] = typeMutations
        }

        /** Alle GraphQL Typen. */
        model.graphQLTypes.forEach((t) => (types[t.name] = t))

        /** Und schließlich die Prüfinformationen. */
        validations.push({
            input: JSON.stringify(model.validation),
            name: model.graphQLType.name,
            update: JSON.stringify(model.updateValidation),
        })
    }

    /** Das ganze in einer Konfiguration zusammenstellen. */
    return {
        mutation:
            Object.keys(mutations).length > 0
                ? new GraphQLObjectType({ fields: mutations, name: 'Mutation' })
                : undefined,
        query: new GraphQLObjectType({ fields: queries, name: 'Query' }),
        types: Object.values(types),
    }
}
