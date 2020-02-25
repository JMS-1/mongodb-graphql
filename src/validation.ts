import { ValidationSchema, ValidationRuleObject } from 'fastest-validator'

import { GqlRecord } from './types'

/**
 * Prüfung durchführen.
 *
 * @param data das zu prüfende JavaScript Objekt.
 * @param type die zugehörige Typbeschreibung.
 * @param forUpdate gesetzt um auf eine Änderungsoperation zu prüfen.
 */
export function validateAndThrow<T>(data: T, type: GqlRecord<T, unknown>, forUpdate?: boolean): void {
    const errors = type.validate(data, forUpdate)

    if (errors !== true) {
        throw new Error(`bad item: ${JSON.stringify(errors)}`)
    }
}

/**
 * Breitet eine Prüfregel für die Benutzung in einer Änderung einer Information vor. Im
 * Allgemeinen bedeutet das, dass alle Felder eines Objektes optional werden.
 *
 * @param value eine Prüfregel oder eine Liste von Prüfregeln.
 */
function convertRuleForUpdate(
    value: ValidationRuleObject | ValidationRuleObject[]
): ValidationRuleObject | ValidationRuleObject[] {
    /** Sonderbehandlung für Felder - zurzeit noch nicht verwendet. */
    if (Array.isArray(value)) {
        /** Das erste Element ist immer die Primäre Datentypregel. */
        const converted = convertRuleForUpdate(value[0]) as ValidationRuleObject

        /** List nur neu Erzeugen wenn sich auf wirklich was verändert hat. */
        return converted === value[0] ? value : [converted, ...value.slice(1)]
    }

    /** Nur echte Regeln berücksichtigen - so filtern wir etwa $$strict aus. */
    let rule = value as ValidationRuleObject

    if (!rule.type) {
        return rule
    }

    /** Kopie erstellen und Feld optional machen, wenn dies nicht explizit verboten wurde. */
    rule = { ...rule }

    if (rule.optional !== false) {
        rule.optional = true
    }

    /** Ansonsten interessieren hier nur Objektfelder. */
    if (rule.type !== 'object') {
        return rule
    }

    let properties = rule.properties

    if (!properties) {
        return rule
    }

    /** Kopie der Feldliste des Unterobjektes erstellen und dieses rekursiv abarbeiten. */
    properties = { ...properties }

    for (const prop of Object.keys(properties)) {
        properties[prop] = convertRuleForUpdate(properties[prop])
    }

    /** Die veränderte Konfiguration blind übernehmen. */
    rule.properties = properties

    return rule
}

/**
 * Wandelt die Prüfregeln zum Anlegen neuer Informationen in Regeln zum Aktualisieren
 * existierender Information um - im Allgemeinen werden dabei einfach alle Felder im
 * Objekt optional.
 *
 * @param schema Prüfregeln zum Anlegen neuer Informationen.
 */
export function convertForUpdate(schema: ValidationSchema): ValidationSchema {
    /** Kopie erstellen und darauf alle Felder durchgehen. */
    schema = { ...schema }

    for (const prop of Object.keys(schema)) {
        schema[prop] = convertRuleForUpdate(schema[prop] as ValidationRuleObject)
    }

    return schema
}
