//! The temperature family used by the demo seed and by databases that already exist.
//!
//! `base = value * factor + offset`, with Celsius as the base.
//! Fahrenheit is `C = F * 5/9 - 160/9`. Kelvin is `C = K - 273.15`.

use std::collections::BTreeMap;

use rust_decimal::Decimal;
use uuid::Uuid;

use crate::definition::{DefinitionSet, Unit, UnitFamily};
use crate::id::UnitFamilyId;
use crate::language::LanguageTag;

const TEMPERATURE_FAMILY_ID: &str = "018f0000-0000-7000-8000-000000000015";

/// Inserts the temperature family, or completes one that only has Celsius.
///
/// Returns whether the set changed. A family that is already complete, or a
/// temperature family whose base is not Celsius, is left as it is.
pub fn ensure_temperature_family(defs: &mut DefinitionSet) -> bool {
    let Some(index) = defs
        .unit_families
        .iter()
        .position(|family| family.key.eq_ignore_ascii_case("temperature"))
    else {
        defs.unit_families.push(canonical_family(defs));
        return true;
    };
    if !celsius_base(&defs.unit_families[index]) {
        return false;
    }
    let label_tag = label_language(defs).cloned();
    let mut changed = false;
    {
        let family = &mut defs.unit_families[index];
        for unit in &mut family.units {
            if is_celsius(unit) && bare_symbol(unit) && unit.symbol != "°C" {
                unit.symbol = "°C".to_owned();
                changed = true;
            } else if is_fahrenheit(unit) && bare_symbol(unit) && unit.symbol != "°F" {
                unit.symbol = "°F".to_owned();
                changed = true;
            }
            changed |= fill_label(label_tag.as_ref(), unit);
        }
    }
    let family = &defs.unit_families[index];
    let mut extra = Vec::new();
    if !family.units.iter().any(is_fahrenheit) {
        extra.push(unit(
            defs,
            "F",
            fahrenheit_factor(),
            fahrenheit_offset(),
            "°F",
            "Fahrenheit",
        ));
    }
    if !family.units.iter().any(is_kelvin) {
        extra.push(unit(
            defs,
            "K",
            Decimal::ONE,
            kelvin_offset(),
            "K",
            "Kelvin",
        ));
    }
    if !extra.is_empty() {
        defs.unit_families[index].units.extend(extra);
        changed = true;
    }
    changed
}

fn canonical_family(defs: &DefinitionSet) -> UnitFamily {
    UnitFamily {
        id: UnitFamilyId::from_uuid(
            Uuid::parse_str(TEMPERATURE_FAMILY_ID).expect("temperature family id"),
        ),
        key: "temperature".to_owned(),
        dimension: Some("temperature".to_owned()),
        base_unit: "C".to_owned(),
        units: vec![
            unit(defs, "C", Decimal::ONE, Decimal::ZERO, "°C", "Celsius"),
            unit(
                defs,
                "F",
                fahrenheit_factor(),
                fahrenheit_offset(),
                "°F",
                "Fahrenheit",
            ),
            unit(defs, "K", Decimal::ONE, kelvin_offset(), "K", "Kelvin"),
        ],
    }
}

fn fahrenheit_factor() -> Decimal {
    Decimal::from(5) / Decimal::from(9)
}

fn fahrenheit_offset() -> Decimal {
    Decimal::from(-160) / Decimal::from(9)
}

fn kelvin_offset() -> Decimal {
    Decimal::new(-27315, 2)
}

fn unit(
    defs: &DefinitionSet,
    code: &str,
    factor: Decimal,
    offset: Decimal,
    symbol: &str,
    label: &str,
) -> Unit {
    Unit {
        code: code.to_owned(),
        factor,
        offset,
        symbol: symbol.to_owned(),
        labels: label_map(defs, label),
    }
}

fn label_language(defs: &DefinitionSet) -> Option<&LanguageTag> {
    defs.languages
        .iter()
        .find(|tag| tag.as_str() == "en")
        .or_else(|| defs.languages.first())
}

fn label_map(defs: &DefinitionSet, label: &str) -> BTreeMap<LanguageTag, String> {
    match label_language(defs) {
        Some(tag) => BTreeMap::from([(tag.clone(), label.to_owned())]),
        None => BTreeMap::new(),
    }
}

fn fill_label(tag: Option<&LanguageTag>, unit: &mut Unit) -> bool {
    if !unit.labels.is_empty() {
        return false;
    }
    let Some(tag) = tag else {
        return false;
    };
    let label = if is_celsius(unit) {
        "Celsius"
    } else if is_fahrenheit(unit) {
        "Fahrenheit"
    } else if is_kelvin(unit) {
        "Kelvin"
    } else {
        return false;
    };
    unit.labels.insert(tag.clone(), label.to_owned());
    true
}

fn celsius_base(family: &UnitFamily) -> bool {
    family.units.iter().any(|unit| {
        unit.code == family.base_unit
            && is_celsius(unit)
            && unit.factor == Decimal::ONE
            && unit.offset == Decimal::ZERO
    })
}

fn bare_symbol(unit: &Unit) -> bool {
    let symbol = unit.symbol.trim();
    symbol.is_empty() || symbol.eq_ignore_ascii_case(&unit.code)
}

fn is_celsius(unit: &Unit) -> bool {
    code_is(unit, &["c", "celsius"]) || unit.symbol == "°C" || unit.symbol == "℃"
}

fn is_fahrenheit(unit: &Unit) -> bool {
    code_is(unit, &["f", "fahrenheit"]) || unit.symbol == "°F"
}

fn is_kelvin(unit: &Unit) -> bool {
    code_is(unit, &["k", "kelvin"])
}

fn code_is(unit: &Unit, names: &[&str]) -> bool {
    let code = unit.code.to_ascii_lowercase();
    names.iter().any(|name| code == *name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty() -> DefinitionSet {
        DefinitionSet {
            model_revision: 1,
            languages: vec![LanguageTag::parse("en").unwrap()],
            unit_families: Vec::new(),
            value_lists: Vec::new(),
            attributes: Vec::new(),
            types: Vec::new(),
            structures: Vec::new(),
        }
    }

    #[test]
    fn a_missing_family_converts_fahrenheit_and_kelvin_to_celsius() {
        let mut defs = empty();
        assert!(ensure_temperature_family(&mut defs));
        assert!(!ensure_temperature_family(&mut defs));
        assert_eq!(defs.unit_families.len(), 1);
        let family = &defs.unit_families[0];
        assert_eq!(family.key, "temperature");
        assert_eq!(family.base_unit, "C");
        assert_eq!(family.id.as_uuid().to_string(), TEMPERATURE_FAMILY_ID);
        let celsius = &family.units[0];
        assert_eq!(celsius.code, "C");
        assert_eq!(celsius.symbol, "°C");
        assert_eq!(celsius.factor, Decimal::ONE);
        assert_eq!(celsius.offset, Decimal::ZERO);
        let fahrenheit = family.units.iter().find(|unit| unit.code == "F").unwrap();
        assert_eq!(fahrenheit.factor, Decimal::from(5) / Decimal::from(9));
        assert_eq!(fahrenheit.offset, Decimal::from(-160) / Decimal::from(9));
        assert_eq!(fahrenheit.symbol, "°F");
        let kelvin = family.units.iter().find(|unit| unit.code == "K").unwrap();
        assert_eq!(kelvin.factor, Decimal::ONE);
        assert_eq!(kelvin.offset, Decimal::new(-27315, 2));
        let boiling = Decimal::from(212) * fahrenheit.factor + fahrenheit.offset;
        assert_eq!(boiling.trunc_with_scale(12), Decimal::from(100));
        let frozen = Decimal::from(27315) / Decimal::from(100) + kelvin.offset;
        assert_eq!(frozen, Decimal::ZERO);
    }

    #[test]
    fn an_existing_celsius_family_gains_fahrenheit_without_a_second_family() {
        let mut defs = empty();
        let id = UnitFamilyId::from_uuid(Uuid::from_u128(9));
        defs.unit_families.push(UnitFamily {
            id,
            key: "temperature".to_owned(),
            dimension: Some("temperature".to_owned()),
            base_unit: "C".to_owned(),
            units: vec![Unit::with_factor("C", Decimal::ONE)],
        });
        assert!(ensure_temperature_family(&mut defs));
        assert_eq!(defs.unit_families.len(), 1);
        let family = &defs.unit_families[0];
        assert_eq!(family.id, id);
        assert_eq!(family.base_unit, "C");
        assert_eq!(family.units.len(), 3);
        let celsius = family.units.iter().find(|unit| unit.code == "C").unwrap();
        assert_eq!(celsius.symbol, "°C");
        assert_eq!(celsius.factor, Decimal::ONE);
        assert!(family.units.iter().any(|unit| unit.code == "F"));
        assert!(family.units.iter().any(|unit| unit.code == "K"));
        assert!(!ensure_temperature_family(&mut defs));
    }

    #[test]
    fn celsius_and_fahrenheit_codes_are_not_duplicated() {
        let mut defs = empty();
        defs.unit_families.push(UnitFamily {
            id: UnitFamilyId::from_uuid(Uuid::from_u128(4)),
            key: "temperature".to_owned(),
            dimension: None,
            base_unit: "celsius".to_owned(),
            units: vec![
                Unit {
                    code: "celsius".to_owned(),
                    factor: Decimal::ONE,
                    offset: Decimal::ZERO,
                    symbol: "°C".to_owned(),
                    labels: BTreeMap::from([(LanguageTag::parse("en").unwrap(), "Celsius".into())]),
                },
                Unit {
                    code: "fahrenheit".to_owned(),
                    factor: fahrenheit_factor(),
                    offset: fahrenheit_offset(),
                    symbol: "°F".to_owned(),
                    labels: BTreeMap::from([(
                        LanguageTag::parse("en").unwrap(),
                        "Fahrenheit".into(),
                    )]),
                },
            ],
        });
        assert!(ensure_temperature_family(&mut defs));
        let family = &defs.unit_families[0];
        assert_eq!(family.units.len(), 3);
        assert_eq!(
            family
                .units
                .iter()
                .filter(|unit| is_fahrenheit(unit))
                .count(),
            1
        );
        assert!(family.units.iter().any(|unit| unit.code == "K"));
    }

    #[test]
    fn a_temperature_family_with_another_base_is_left_alone() {
        let mut defs = empty();
        defs.unit_families.push(UnitFamily {
            id: UnitFamilyId::from_uuid(Uuid::from_u128(5)),
            key: "temperature".to_owned(),
            dimension: None,
            base_unit: "rankine".to_owned(),
            units: vec![Unit::with_factor("rankine", Decimal::ONE)],
        });
        assert!(!ensure_temperature_family(&mut defs));
        assert_eq!(defs.unit_families[0].units.len(), 1);
    }
}
