import { GraphQLFieldConfig, GraphQLFieldConfigMap, GraphQLObjectType } from 'graphql'

import { Collection } from './collection'
import { TGqlFilter } from './filterTypes'
import { GqlRecord, TGqlObject, GqlBase, GqlArgs, TGqlFilterTypes, IGqlObjectLayout } from './types'
import { validateAndThrow } from './validation'

/** Informationen zu einer registrierten GraphQL Operation. */
export interface IMethodRegistration<
    TArgs extends IGqlObjectLayout,
    TResult,
    TFilter extends TGqlFilterTypes,
    TLayout
> {
    /** Die tatsächliche Ausführung bei Aufruf der Methode - eine Parameterprüfung hat bereits stattgefunden. */
    handler(args: TGqlObject<TArgs>): Promise<TResult>
    /** Layout für die Typdefinition der Parameter. */
    readonly args: TArgs
    /** Typdefinition der Parameter. */
    readonly argsType: GqlRecord<TGqlObject<TArgs>, unknown>
    /** GraphQL Beschreibung der Operation. */
    readonly method: GraphQLFieldConfig<unknown, unknown>
    /** Typdefinition des Rückgabewertes der Operation. */
    readonly resultType: GqlBase<TResult, TFilter, TLayout>
}

/** Ermittelt den JavaScript Datentyp für die Parameter einer Methode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TGetMethodArgs<T extends Collection<any, any>, TOp extends keyof T> = T[TOp] extends IMethodRegistration<
    infer TArgs,
    infer TResult,
    infer TFilter,
    infer TLayout
>
    ? TGqlObject<TArgs>
    : never

/** Ermittelt den JavaScript Datentyp für die Suchparameter. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TGetFilterArgs<T extends Collection<any, any>, TOp extends keyof T> = TGetMethodArgs<T, TOp> & {
    filter?: TGqlFilter<T['model']>
}

/** Ermittelt den JavaScript Datentyp für den Rückgabewert einer Methode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TGetMethodResult<T extends Collection<any, any>, TOp extends keyof T> = T[TOp] extends IMethodRegistration<
    infer TArgs,
    infer TResult,
    infer TFilter,
    infer TLayout
>
    ? TResult
    : never

/** Abstrakter Zugriff auf eine Datenbank. */
interface IDatabase<TItem> {
    readonly model: GqlRecord<TItem, unknown>
}

/** Hilfsklasse zur Verwaltung von GraphQL Methoden. */
abstract class MethodManager<TItem> {
    /** Alle bisher registrierten Operationen. */
    private readonly _methods: {
        [memberName: string]: IMethodRegistration<IGqlObjectLayout, unknown, 'unknown', unknown>
    } = {}

    /**
     * Initialisiert die Verwaltung.
     *
     * @param _scope die Art der GraphQL Operation.
     * @param _resolver die Datenbank Anbindung zur Ausführung der Operationen.
     * @param _description optional eine Beschreibung für die hier verwalteten Operationen.
     * */
    protected constructor(
        private readonly _scope: 'Query' | 'Mutation' | 'Subscription',
        private readonly _resolver: IDatabase<TItem>,
        private readonly _description?: string
    ) {}

    /** Meldet alle Operationen in der zugehörigen GraphQL Notation. */
    get methods(): GraphQLFieldConfig<unknown, unknown> {
        const fields: GraphQLFieldConfigMap<unknown, unknown> = {}

        /** Alle Registrierungen durchgehen und übernehmen. */
        for (const member of Object.keys(this._methods)) {
            const registration = this._methods[member]

            fields[member] = registration.method
        }

        /** GraphQL Konfiguration mit resolve Bindung an die Datenbank aufsetzen. */
        return {
            resolve: () => this._resolver,
            type: new GraphQLObjectType({
                description: this._description,
                fields,
                name: `${this._resolver.model.graphQLType.name}${this._scope}`,
            }),
        }
    }

    /**
     * Meldet eine GraphQL Operation an.
     *
     * @param name der GraphQL Name der Operation.
     * @param args Layout der Parameter.
     * @param resultType Typdefinition des Rückgabewertes.
     * @param description optionale Beschreibung der Operation.
     * @param processor führt die Operation nach Prüfung der Parameter aus.
     */
    register<TArgs extends IGqlObjectLayout, TResult, TFilter extends TGqlFilterTypes, TLayout>(
        name: string,
        args: TArgs,
        resultType: GqlBase<TResult, TFilter, TLayout>,
        description: string,
        processor: (args: TGqlObject<TArgs>) => Promise<TResult>
    ): IMethodRegistration<TArgs, TResult, TFilter, TLayout> {
        return this._register(false, name, args, resultType, description, processor)
    }

    /**
     * Meldet eine GraphQL Änderungsoperation an. Im Gegensatz zu allen anderen
     * Operationen wird hier eine vereinfachte Prüfung der aktuellen Parameter
     * durchgeführt.
     *
     * @param name der GraphQL Name der Operation.
     * @param args Layout der Parameter.
     * @param resultType Typdefinition des Rückgabewertes.
     * @param description optionale Beschreibung der Operation.
     * @param processor führt die Operation nach Prüfung der Parameter aus.
     */
    registerUpdate<TArgs extends IGqlObjectLayout, TResult, TFilter extends TGqlFilterTypes, TLayout>(
        name: string,
        args: TArgs,
        resultType: GqlBase<TResult, TFilter, TLayout>,
        description: string,
        processor: (args: TGqlObject<TArgs>) => Promise<TResult>
    ): IMethodRegistration<TArgs, TResult, TFilter, TLayout> {
        return this._register(true, name, args, resultType, description, processor)
    }

    /**
     * Registriert eine GraphQL Operation.
     *
     * @param useUpdate gesetzt, wenn eine vereinfachte Prüfung bei Änderungsoperationen
     * ausgeführt werden soll.
     * @param name der GraphQL Name der Operation.
     * @param args Layout der Parameter.
     * @param resultType Typdefinition des Rückgabewertes.
     * @param description optionale Beschreibung der Operation.
     * @param processor führt die Operation nach Prüfung der Parameter aus.
     */
    private _register<TArgs extends IGqlObjectLayout, TResult, TFilter extends TGqlFilterTypes, TLayout>(
        useUpdate: boolean,
        name: string,
        args: TArgs,
        resultType: GqlBase<TResult, TFilter, TLayout>,
        description: string,
        processor: (args: TGqlObject<TArgs>) => Promise<TResult>
    ): IMethodRegistration<TArgs, TResult, TFilter, TLayout> {
        /** Datentyp für die formalen Parameter anlegen. */
        const argsType = GqlArgs(args)

        /** Registrierung anlegen und in die Verwaltung eintragen. */
        const proxy: IMethodRegistration<TArgs, TResult, TFilter, TLayout> = {
            args,
            argsType,
            handler: processor,
            method: {
                args: argsType[useUpdate ? 'graphQLUpdateType' : 'graphQLInputType'].getFields(),
                description,
                resolve: (source: IDatabase<TItem>, args: TGqlObject<TArgs>) => {
                    /** Aktuelle Parameter prüfen. */
                    validateAndThrow(args, this._methods[name].argsType, useUpdate)

                    /** Ausführung mit geprüften Parametern durchführen. */
                    return processor(args)
                },
                type: resultType.outputType,
            },
            resultType,
        }

        this._methods[name] = proxy as IMethodRegistration<IGqlObjectLayout, unknown, 'unknown', unknown>

        return proxy
    }
}

/** Erstellt eine Verwaltung für GraphQL Suchoperationen. */
export class QueryManager<TItem> extends MethodManager<TItem> {
    constructor(resolver: IDatabase<TItem>, description?: string) {
        super('Query', resolver, description)
    }
}

/** Erstellt eine Verwaltung für GraphQL Änderungsoperationen. */
export class MutationManager<TItem> extends MethodManager<TItem> {
    constructor(resolver: IDatabase<TItem>, description?: string) {
        super('Mutation', resolver, description)
    }
}
