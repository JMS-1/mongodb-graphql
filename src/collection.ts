import * as mongodb from 'mongodb'
import { v4 as uuid } from 'uuid'

import { Connection } from './connection'
import { createObjectFilter, toMongoFilter } from './filter'
import { QueryManager, MutationManager } from './methods'
import * as types from './types'
import { TSortDirection } from './enum'

/** Basisklasse zur Implementierung einer Anbindung an eine MongoDb Datenbank. */
export abstract class CollectionBase<TItem extends { _id: string }, TLayout> {
    /** Der Name der zugehörigen Collection (Tabelle). */
    abstract readonly collectionName: string

    /** Alle registrierten GraphQL Suchoperationen. */
    readonly queries: QueryManager<TItem> = new QueryManager(this)

    /** Alle registrierten GraphQL Änderungsoperationen. */
    readonly mutations: MutationManager<TItem> = new MutationManager(this)

    /**
     * Initialisiert eine neue Anbindung.
     *
     * @param model die zugehörige Typdefinition.
     * @param connection die zu verwendende MongoDb Datenbank.
     */
    constructor(public readonly model: types.GqlRecord<TItem, TLayout>, readonly connection: Connection) {}

    /**
     * Wird einmalig zur Initialisierung aufgerufen. Hier können zum Beispiel Index angelegt werden.
     */
    initialize(): Promise<void> {
        return Promise.resolve<void>(undefined)
    }

    /** Ermittelt die zugehörige Collection (Tabelle). */
    get collection(): Promise<mongodb.Collection<TItem>> {
        return this.connection.getCollection(this.collectionName)
    }

    /**
     * Kann Überladen werden um eine Entität aus der Datenbank als GraphQL Rückgabewert
     * aufzubereiten - etwa durch Ergänzen von berechneten Werten.
     *
     * @param item Eine Entität aus der Datenbank.
     */
    async toGraphQL(item: TItem): Promise<TItem> {
        return item
    }

    /**
     * Wird unmittelbar vor dem Einfügen einer neuen Entität in die Datenbank aufgerufen.
     *
     * @param item die neu einzufügende Entität.
     */
    beforeInsert?(item: TItem): Promise<void>

    /**
     * Wir unmittelbar nach dem Einfügen einer neuen Entität in die Datenbank aufgerufen.
     *
     * @param item  die neu eingefügte Entität.
     */
    afterInsert?(item: TItem): Promise<void>

    /** Informationen zur Registrierung der Methode zum Anlegen einer neuen Entität. */
    readonly add = this.mutations.register(
        'add',
        { data: this.model },
        this.model,
        'Entität hinzufügen.',
        async (args) => {
            /** Eindeutige Kennung automatisch erstellen. */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const added = { ...(args.data as any), _id: uuid() }

            /** Eingriff durch die abgeleitete Klasse erlauben. */
            if (this.beforeInsert) {
                await this.beforeInsert(added)
            }

            /** Neue Entität in der Datenbank anlegen. */
            const self = await this.collection

            await self.insertOne(added)

            /** Eingriff durch die abgeleitete Klasse erlauben. */
            if (this.afterInsert) {
                await this.afterInsert(added)
            }

            /** Neue Entität als GraphQL Ergebnis melden. */
            return this.toGraphQL(added)
        }
    )

    /** Wird vor der Aktualisierung einer Entität aufgerufen. */
    beforeUpdate?(item: Partial<TItem>, _id: string): Promise<void>

    /** Wird nach der Aktualisierung einer Entität aufgerufen. */
    afterUpdate?(item: TItem): Promise<void>

    /** Informationen zur Registrierung der Methode zum Ändern einer vorhandenen Entität. */
    readonly update = this.mutations.registerUpdate(
        'update',
        { _id: types.GqlId(), data: this.model },
        this.model,
        'Entität aktualisieren.',
        async (args) => {
            /** Suche der betroffenen Entität vorbereiten. */
            const filter = { _id: args._id } as mongodb.Filter<TItem>

            /** Änderung vorbereiten. */
            const item = { ...args.data }

            /** Eingriff durch die abgeleitete Klasse erlauben. */
            if (this.beforeUpdate) {
                await this.beforeUpdate(item, args._id)
            }

            /** Änderung durchführen. */
            const self = await this.collection

            const updated =
                Object.keys(args.data).length > 0
                    ? (await self.findOneAndUpdate(filter, { $set: item as any }, { returnDocument: 'after' })).value
                    : await self.findOne(filter)

            if (!updated) {
                throw new Error('item not found')
            }

            /** Eingriff durch die abgeleitete Klasse erlauben. */
            if (this.afterUpdate) {
                await this.afterUpdate(updated as TItem)
            }

            /** Veränderte Entität als GraphQL Ergebnis melden. */
            return this.toGraphQL(updated as TItem)
        }
    )

    /** Wird unmittelbar vor dem Löschen einer Entität aufgerufen. */
    beforeRemove?(_id: string): Promise<void>

    /** Wird unmittelbar nach dem erfolgreichen Löschen einer Entität aufgerufen. */
    afterRemove?(item: TItem): Promise<void>

    /** Informationen zur Registrierung der Methode zum Entfernen einer Entitäten, */
    readonly remove = this.mutations.register(
        'delete',
        { _id: types.GqlId() },
        this.model,
        'Entität entfernen.',
        async (args) => {
            /** Eingriff durch die abgeleitete Klasse erlauben. */
            if (this.beforeRemove) {
                await this.beforeRemove(args._id)
            }

            /** Löschoperation in der Datenbank durchführen. */
            const self = await this.collection

            const result = await self.findOneAndDelete({ _id: args._id } as mongodb.Filter<TItem>)
            const deleted = result.value

            if (!deleted) {
                throw new Error('item not found')
            }

            /** Eingriff durch die abgeleitete Klasse erlauben. */
            if (this.afterRemove) {
                await this.afterRemove(deleted as TItem)
            }

            /** Entfernte Entität als GraphQL Ergebnis melden. */
            return this.toGraphQL(deleted as TItem)
        }
    )

    /** Informationen zur Registrierung der Methode zum Nachschlagen einer existierenden Entitäten, */
    readonly findOne = this.queries.register(
        'findById',
        { _id: types.GqlId() },
        this.model,
        'Einzelne Entität suchen.',
        async (args) => {
            /** In der Datenbank nachschlagen. */
            const self = await this.collection

            const item = await self.findOne({ _id: args._id } as mongodb.Filter<TItem>)

            /** Entität als GraphQL Ergebnis melden. */
            return item && this.toGraphQL(item as TItem)
        }
    )

    /** Informationen zur Registrierung der Methode zum Suchen nach Entitäten. */
    readonly find = this.queries.register(
        'find',
        {
            filter: types.GqlNullable(createObjectFilter(this.model.graphQLType)),
            page: types.GqlNullable(
                types.GqlInt({
                    description: 'Erste Seite im Ergebnisfenster.',
                    validation: { min: 1 },
                })
            ),
            pageSize: types.GqlNullable(
                types.GqlInt({
                    description: 'Größe des Ergebnisfensters.',
                    validation: { max: 1000, min: 1 },
                })
            ),
            sort: types.GqlNullable(types.GqlSort(this.model)),
        },
        types.GqlObject(`Find${this.model.graphQLType.name}Result`, {
            items: types.GqlArray(this.model, { description: 'Alle Entitäten im angeforderten Ergebnisfenster.' }),
        }),
        'Freie Suche.',
        async (args) => {
            /** Ergebnisfenster ermitteln. */
            const pageSize = args.pageSize || 100
            const pageOffset = (args.page || 1) - 1

            /** Sortierung auswerden. */
            const sort: Record<string, 1 | -1> = {}

            for (const sortField of args.sort || []) {
                sort[sortField.field] = sortField.direction === TSortDirection.Ascending ? 1 : -1
            }

            /** Stabile Sortierung auf unterester Ebene erzwingen. */
            sort._id = 1

            /** Suche durchführen. */
            const self = await this.collection

            const items = await self
                .find(toMongoFilter(args.filter))
                .sort(sort)
                .skip(pageOffset * pageSize)
                .limit(pageSize)
                .toArray()

            /** Entitäten als GraphQL Ergebnis melden. */
            return { items: await Promise.all(items.map(async (i) => await this.toGraphQL(i as TItem))) }
        }
    )
}

/** Vereinfachte Klassendefinition für reguläre Entitäten (mit _id). */
export abstract class Collection<
    TModel extends types.GqlRecord<TItem, TLayout>,
    TItem = types.TGqlType<TModel>,
    TLayout = types.TGqlLayoutType<TModel>
> extends CollectionBase<TItem extends { _id: string } ? TItem : never, TLayout> {}
