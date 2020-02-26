import * as mongodb from 'mongodb'

import { Collection } from './collection'
import * as types from './types'

/** Beschreibt den Konstruktor für eine MongoDb Anbindung. */
interface ICollectionFactory<TItem, TLayout> {
    /** Erstellt eine neue Anbindung für eine einzelne Typdefinition. */
    new (model: types.GqlRecord<TItem, TLayout>, connection: Connection): Collection<typeof model>
}

/** Verwaltet die Verbindung zu einer einzelnen MongoDb Datenbank. */
export class Connection {
    /**
     * Erstellt eine neu Verwaltung.
     *
     * @param _client Eine geeignet konfigurierte Verbindung.
     */
    constructor(private readonly _client: Promise<mongodb.MongoClient>) {}

    /** Meldet die aktuelle Datenbank. */
    get database(): Promise<mongodb.Db> {
        return this._client.then(c => c.db())
    }

    /** Meldet eine Verbindung zu einer einzelnen Collection (Tabelle). */
    getCollection<TIem>(name: string): Promise<mongodb.Collection<TIem>> {
        return this.database.then(db => db.collection(name))
    }

    /**
     * Erstellt eine neue Anbindung.
     *
     * @param model die zu verwendende Typdefinition.
     * @param factory Methode zum Erstellen der Anbindung - die dann direkt mit der
     * hier verwalteten MongoDb Datenbank verbunden wird.
     */
    createCollection<TItem, TLayout>(
        model: types.GqlRecord<TItem, TLayout>,
        factory: ICollectionFactory<TItem, TLayout>
    ): Collection<typeof model> {
        return new factory(model, this)
    }
}
