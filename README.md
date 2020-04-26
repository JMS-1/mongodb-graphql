# Hintergrund

Zur Bereitstellung eines (Web) Dienstes mit einer persistenten Ablage in einer MongoDb Datenbank als GraphQL Schnittstelle bietet sich im Node.Js Umfeld der folgende sehr leistungsfähige Software-Stack an:

-   [mongodb Treiber](https://www.npmjs.com/package/mongodb)
-   [mongoose ORM Layer](https://www.npmjs.com/package/mongoose)
-   [GraphQL Adapter für mongoose](https://www.npmjs.com/package/graphql-compose-mongoose)
-   [Apollo Web Server](https://www.npmjs.com/package/apollo)

Natürlich bekommt man nicht alles geschenkt, aber man erhält sehr schnell eine umfangreiche GraphQL Schnittstelle zu gewählten Datenbankschema. Das man sein Schema definieren muss, vielleicht auch noch den genauen Umfang der Schnittstelle definieren sollte usw. ist eigentlich selbstverständlich und in jeder denkbaren Umgebung ein notwendiges Übel.

Ich selbst habe mich ein wenig mit diesem Stack auseinandergesetzt und würde mir ein paar spezielle Funktionalitäten wünschen, die ich auf Basis meines aktuellen Kenntnisstands nicht umsetzen könnte - das muss nicht zwingend etwas heißen! Ich habe mir daher in einem kleinen Entscheidungsprojekt versucht mir eine Vorstellung zu machen, wie eine Alternative aussehen könnte - vielleicht grob vergleichbar mit einer Spike Story in Scrum. Mehr ist es aber auch wirklich nicht und dementsprechend das aktuelle Zwischenergebnis zu bewerten.

Vorweg soviel: für die experimentelle Umsetzung hat es sich erst einmal scheinbar als nützlich erwiesen, die beiden mittleren Layer im Stack zu ersetzen - sprich auf mongoose zu verzichten. Tatsächlich könnte sich das als ein Show Stopper für diese Alternative erweisen, da mongoose eine erhebliche Umsetzung von Datenbankzugriffen auf die MongoDb unterstützt und diese über den GraphQL Adapter auch leicht verfügbar gemacht werden können. Für eine echte Alternative müsste hier vermutlich soviel Arbeit geleistet werden, dass dich das projekt als Ganzes eventuell nicht mehr lohnt. Aber es schadet sich nicht, sich einmal Alternativen anzuschauen.

# Über dieses README

In den folgenden Beispielen konzentriere ich mich auf die wesentlichen Aspekte der Implementierung - ich will zwar nicht gerade sagen, dass es nur die Spitze des Eisbergs ist aber ein bißchen mehr als das was gleich kommt habe ich schon probiert.

# Übersicht über die Implementierung

Fangen wir einfach mal auf der ORM Layer an - eigentlich ungewöhnlich bei Verwendung einer NoSQL Datenbank, aber wie vermutlich jeder der damit täglich umgehen muss weiß doch sehr oft sehr nützlich. Im Beispiel haben wir nur eine einzige Entität: Bücher. Und damit es nicht ganz so einfach wird kann jedes Buch auch optional eine Liste von Besprechungsreferenzen haben - hier in die Entität als Feld eingebettet.

```typescript
export const BookReview = GqlObject('BookReview', { from: GqlString() })

export const Book = GqlObject('Book', {
    _id: GqlId({ computed: true }),
    author: GqlString(),
    reviews: GqlNullable(GqlArray(BookReview)),
    title: GqlString(),
    year: GqlInt(),
})
```

Als erstes bemerkt man, dass die Schemadefinitionen nicht einfach universell sind, sondern sich offenbar auch direkt an der späteren Nutzung in einer GraphQL Schnittstelle orientieren. Für die Besprechungsreferenzen wird ein GraphQL Typ _BookReview_ definiert, der als einziges Feld eine Zeichenkette _from_ enthält. Mit dem GraphQL Typen _Book_ verhält es sich genauso, lediglich deutet hier die Option _computed_ darauf hin, dass es sich bei \__id_ um ein Feld handelt, das vom Server automatisch berechnet wird und nicht mehr nachträglich verändert werden kann.

Ich denke mal bis auf die Notation an sich nichts Neues für jemanden, der schon einmal zum Beispiel mit mongoose ein ORM Schema definiert hat.

Für das Beispiel wird folgendes GraphQL Schema erstellt:

```graphql
type BookReview {
    from: String!
}

type Book {
    _id: ID!
    author: String!
    reviews: [BookReview!]
    title: String!
    year: Int!
}
```

## TypeScript und Single-Point-Of-Truth

Das _document_ Konzept von mongoose sieht vor, dass Entitäten grundsätzlich durch JavaScript Objekte beschrieben werden, die neben Eigenschaften auch Methoden wie _save_ haben. Je nach Komplexität der Geschäftslogik im Server kann das durchaus die Implementierung vereinfachen, allerdings müssen oft auch Objekte angelegt werden einfach nur um Felder zu übertragen. Ich stelle mir persönlich eine etwas leichtgewichtigere Lösung vor, die auf reinen [DTO](https://de.wikipedia.org/wiki/Transferobjekt) Objekten arbeitet.

Es ist ja eigentlich völlig klar, wie eine TypeScript Schnittstellendefinition für das Beispiel aussehen wird - natürlich genauso wie für ein mongoose _Model_. Es wäre aber schön, wenn man diese aus dem Schema direkt ableiten könnte.

```typescript
export type IBookReview = TGqlType<typeof BookReview>
export type IBook = TGqlType<typeof Book>
```

Diese beiden Typdefinitionen machen hier genau das gewünscht. So hat _IBook_ zum Beispiel ein Feld _reviews?_ dessen Elementtyp semantisch identisch (via Duck Typing) zu _IBookReview_ ist, worin wiederum ein Feld _from_ als Zeichenkette gefordert wird. Stellt man sich nun vor, dass der Server als NPM Paket angeboten würde und man würde diese Definitionen geeignet im Dateibaum platzieren, so kann eine Client Anwendung diese Definitionen einbinden und nutzen - und damit typsicher gegen das Schema des Servers programmieren.

Natürlich muss so ein Client vielleicht auch einmal eine Suchoperation formulieren. In der Implementierung werden im GraphQL entsprechende Typen angelegt - das Folgende ist nur ein Auszug, man kann sich leicht vorstellen, wie das im Ganzen aussieht.

```graphql
input BookFilterInput {
    author: StringFilterInput
    reviews: BookBookReviewFilterInput
    title: StringFilterInput
    year: IntFilterInput
    And: [BookFilterInput!]
    Or: [BookFilterInput!]
}

input BookBookReviewFilterInput {
    from: StringFilterInput
}

input StringFilterInput {
    Eq: String
    Exists: Boolean
    Gt: String
    Gte: String
    In: [String!]
    Lt: String
    Lte: String
    Neq: String
    Nin: [String!]
    RegEx: String
}
```

Um dafür eine passende Schnittstelle für die Client Programmierung zu erhalten reicht dann wieder ein direkter Bezug auf die Schemadefinition.

```typescript
export type IBookFilter = TGqlFilter<typeof Book>
```

Das folgende Beispiel ist natürlich nicht sonderlich sinnvoll, zeigt aber sehr schön die Idee

```typescript
export const test: IBookFilter = {
    Or: [{ year: { Gt: 2000 } }, { reviews: { from: { RegEx: 'faz' } } }],
}
```

## Prüfinformationen und Single-Point-Of-Truth

Für mich persönlich halte ich es auch für wichtig, dass ein Server einem Client auch die Prüfungen mitteilen kann, die zum Beispiel beim Speichern einer Entität in der Datenbank angewendet würden - soweit das natürlich möglich ist, die wichtigsten Ausnahmen sind sicher eindeutige Indexe oder die Verwendung von Fremdschlüsseln. mongoose verwendet ein eigenes Prüfsystem, ich habe eigentlich ganz gut Erfahrungen mit dem [fastest-validator](https://www.npmjs.com/package/fastest-validator) - auch wenn auch der so einige Macken hat.

Als erstes erweitern wir unser Beispiel mal ein wenig.

```typescript
export const BookReview = GqlObject(
    'BookReview',
    { from: GqlString({ description: 'Quelle der Besprechung.', validation: { type: 'url' } }) },
    { description: 'Alle Medien, in denen das Buch besprochen wurde.' }
)

export const Book = GqlObject(
    'Book',
    {
        _id: GqlId({ computed: true, description: 'Automatisch vergebene eindeutige Kennung des Buches.' }),
        author: GqlString({ description: 'Autor des Buches.', validation: { empty: false } }),
        reviews: GqlNullable(GqlArray(BookReview, { description: 'Alle Besprechungen des Buches.' })),
        title: GqlString({ description: 'Der Titel des Buches.', validation: { empty: false } }),
        year: GqlInt({ description: 'Erscheinungsjahr der ersten Auflage des Buches.' }),
    },
    { description: 'Beschreibt ein Buch.' }
)
```

Die _description_ ist hier nur der Vollständigkeit enthalten, sie schlägt sich nur im GraphQL Schema nieder. Als ein Beispiel sei die _url_ Prüfung erwähnt, die nun sicherstellt, dass beimn Speichern eines Buchs in der Datenbank alle
_from_ Felder der Buchbesprechungen eine gültige URL enthalten.

In der aktuellen Implementierung kann ein Client diese Prüfinformationen auch über einen GraphQL Befehl (Query) abrufen.

```graphql
type ValidationInformation {
    input: String!
    name: String!
    update: String!
}

type Query {
    validation: [ValidationInformation!]!
}
```

Die Antwort im JSON Format kann dann im Client direkt genutzt werden, um ein Prüfschema zu erstellen und Daten bereits vor dem Senden potentiell ungültiger Informationen an den Server zu prüfen. Hier wird auch zwischen dem Anlegen (_input_) und dem Ändern (_update_) von Informationen unterschieden: beim Ändern sind im Allgemeinen alle Felder optional. Auch wenn ich hier eigentlich nicht in die Tiefe gehen wollte, vielleicht doch ein Hinweis: bei einer vollständigen Implementierung (die hier bewußt nicht erfolgt ist) müsste man unterscheiden, ob man nur die Eingangsdaten prüft oder diese in die bereits existierende Entität einmischt und diese dann als Ganzes prüft.

Die Prüfinformationen für das Anlegen eines Buches sehen im Beispiel wie folgt aus - intern ist erst einmal alles auf den Einsatz von multiplen Prüfungen pro Feld vorbereitet, daher die Felder mit immer nur einem Element:

```json
{
    "$$strict": true,
    "author": [{ "type": "string", "empty": false }],
    "reviews": [
        {
            "type": "array",
            "items": [
                {
                    "type": "object",
                    "strict": true,
                    "properties": { "from": [{ "type": "url" }] }
                }
            ],
            "optional": true
        }
    ],
    "title": [{ "type": "string", "empty": false }],
    "year": [{ "type": "number", "integer": true }]
}
```

## Sortierung und andere offene Punkte

Auch die Sortierung kann direkt im Schema definiert werden, wobei sich hier allerdings schon die Frage stellt, ob dies die richtige Stelle ist. Immerhin hat diese Information recht wenig mit der GraphQL Definition zu tun. Würde man den Ansatz weiterentwickeln, so werden ähnliche Fragestellungen zum Beispiel im Zusammenhang mit Indexen in der Datenbank aufkommen.

```typescript
export const BookReview = GqlObject(
    'BookReview',
    { from: GqlString({ description: 'Quelle der Besprechung.', sortable: true, validation: { type: 'url' } }) },
    { description: 'Alle Medien, in denen das Buch besprochen wurde.' }
)

export const Book = GqlObject(
    'Book',
    {
        _id: GqlId({ computed: true, description: 'Automatisch vergebene eindeutige Kennung des Buches.' }),
        author: GqlString({ description: 'Autor des Buches.', sortable: true, validation: { empty: false } }),
        reviews: GqlNullable(GqlArray(BookReview, { description: 'Alle Besprechungen des Buches.' })),
        title: GqlString({ description: 'Der Titel des Buches.', sortable: true, validation: { empty: false } }),
        year: GqlInt({ description: 'Erscheinungsjahr der ersten Auflage des Buches.', sortable: true }),
    },
    { description: 'Beschreibt ein Buch.' }
)
```

Tatsächlich wird dadurch bereits in der aktuellen Implementierung ein passender GraphQL Typ erstellt.

```graphql
enum BookSortFields {
    author
    reviewsFrom
    title
    year
}

enum SortDirection {
    Ascending
    Descending
}

input BookSortInput {
    direction: SortDirection!
    field: BookSortFields!
}
```

Bisher habe ich allerdings noch keine Möglichkeit gefunden, hierzu automatisch eine passende TypeScript Notation zu finden, die es einem Client erlauben würde, Fehlübertragungen zu vermeiden.

## Anbindung an die Datenbank

Hier kommt nun der Teil, den mongoose definitiv dramatisch besser abbildet. Ich möchte allerdings die Alternativüberlegungen nicht ganz unter den Tisch kehren.

```typescript
export const MongoConnection = new Connection(
    MongoClient.connect('mongodb://localhost:27017/apollo1', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
)

export const BookCollection = MongoConnection.createCollection(
    Book,
    class BookCollection extends Collection<IBook, TGqlLayoutType<typeof Book>> {
        readonly collectionName = 'books'
    }
)

const server = new ApolloServer({
    schema: new GraphQLSchema(
        createSchemaConfiguration({
            books: BookCollection,
        })
    ),
})
```

Ich denke man kann sich leicht vorstellen, wie das dann aussieht wenn es mehrere Arten von Entitäten gibt. Die _Collection_ Basisklasse bietet auf Basis der Schemadefinition schon entsprechende GraphQL Operationen an - hier erst einmal nur zwei Queries und drei Mutations.

```graphql
type Query {
    validation: [ValidationInformation!]!
    books: BookQuery
}

type BookQuery {
    findById(_id: ID!): Book!
    find(filter: BookFilterInput, page: Int, pageSize: Int, sort: [BookSortInput!]): [Book!]!
}

type Mutation {
    books: BookMutation
}

type BookMutation {
    add(data: BookInput!): Book!
    update(_id: ID!, data: BookUpdate!): Book!
    delete(_id: ID!): Book!
}
```

Im vorliegenden Konzept werden GraphQL Operationen gezielt in der eigenen _Collection_ Klasse registriert. Auf Details der verschiedenen Experimente möchte ich hier nicht eingehen nur soviel: bei dem Ergebnis einer Registrierung handelt es sich nicht um eine ausführbare Methode, sondern vielmehr um eine Registrierungsinformation, die eine Überladung auch mit erweiterten oder verändertem Parametern erlaubt. Hier einmal ein Beispiel aus der Basisklasse.

```typescript
    readonly findOne = this.queries.register(
        'findById',
        { _id: types.GqlId() },
        this.model,
        'Einzelne Entität suchen.',
        async args => {
            /** In der Datenbank nachschlagen. */
            const self = await this.collection
            const item = await self.findOne({ _id: args._id } as mongodb.FilterQuery<TItem>)

            /** Entität als GraphQL Ergebnis melden. */
            return item && this.toGraphQL(item)
        }
    )
```

Registriert wird eine GraphQL Operation (Query) mit dem Namen _findById_ - der Name des Registierungsfelds _findOne_ ist rein willkürlich und wird nur für Überladungen der GraphQL Operation verwendet.

Die beiden nächsten Parameter der Registrierung beschreiben die aktuellen Parameter der Operation und den Rückgabewert. Wie im Schema können die aktuellen Parameter auch mit weitergehenden Prüfinformationen versehen werden, hier einmal auszugsweise am Beispiel der GraphQL Operation _find_:

```typescript
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
```

Nach der Beschreibung kommt dann der Code, mit dem die GraphQL Operation ausgeführt wird. Bereits vor dem Aufruf sind die Eingangsparameter gemäß der Registrierung geprüft worden. In der Implementierung der Basisklasse sieht man auch schon erste Ideen, wie man etwa mit berechneten Feldern umgehen könnte - angedeutet durch den zusätzliche Aufruf von _toGraphQL_. Das Beispiel endet aber an dieser Stelle, die Methode _toGraphQL_ ist leer.

Für alle GraphQL Operationen lassen sich auch automatisch entsprechende Schnittstellen für den Client ableiten - sicher so noch unvollständig und auch mit der Sortierung gibt es die oben aufgeführten Probleme. Wie man sieht gibt es in der Tat eine Sonderbehandlung für den Filter einer Suchoperation.

```typescript
export type IBookFindArgs = TGetFilterArgs<typeof BookCollection, 'find'>
export type IBookFindResult = TGetMethodResult<typeof BookCollection, 'find'>

export type IBookFindOneArgs = TGetMethodArgs<typeof BookCollection, 'findOne'>
export type IBookFindOneResult = TGetMethodResult<typeof BookCollection, 'findOne'>

export type IBookAddArgs = TGetMethodArgs<typeof BookCollection, 'add'>
export type IBookAddResult = TGetMethodResult<typeof BookCollection, 'add'>

export type IBookUpdateArgs = TGetMethodArgs<typeof BookCollection, 'update'>
export type IBookUpdateResult = TGetMethodResult<typeof BookCollection, 'update'>

export type IBookRemoveArgs = TGetMethodArgs<typeof BookCollection, 'remove'>
export type IBookRemoveResult = TGetMethodResult<typeof BookCollection, 'remove'>
```

# Elementare Beispielprojekte

- [Server](https://github.com/JMS-1/mongodb-graphql-server-sample)
- [Client](https://github.com/JMS-1/mongodb-graphql-client-sample)
- [Filmdatenbank (Server & Client)](https://github.com/JMS-1/MovieDBNode)
