"use strict";

//
// imports
//
const _ = require("lodash");
const typesMap = require("./typesMap");
const dataTypesMap = require("./dataTypesMap");

//
// constants
//
const defaultMaxImportsInline = +(process.env.AUTODISCOVER_MAX_IMPORTS_INLINE || 4);
const defaultStringQuotes = process.env.AUTODISCOVER_STRING_QUOTES || "\"";
const defaultIndentSize = +(process.env.AUTODISCOVER_INDENT_SIZE || 2);

//
// helpers
//
const indent = (n = 1) => {
  return " ".repeat(n);
};

const dbTypeToTsType = (type = "", options = {}) => {
  const resolvedType = type.split("(")[0].toUpperCase();

  return options.tsTypes?.[resolvedType] || typesMap[resolvedType] || "any";
};

const dbTypeToDataType = (type = "", options = {}) => {
  const resolvedType = type.split("(")[0].toUpperCase();

  return options.dataTypes?.[resolvedType] || dataTypesMap[resolvedType] || "DataType.JSON";
};

const importsToString = (imports = [], options = {}) => {
  const maxImportsInline = options.maxImportsInline || defaultMaxImportsInline;
  const stringQuotes = options.stringQuotes || defaultStringQuotes;
  const indentSize = options.indentSize || defaultIndentSize;
  const indentation = indent(indentSize);
  const strBuilder = [];

  const sortedImports = { sequelize: imports.sequelize, ..._.omit(imports, ["sequelize"]) };

  Object.keys(sortedImports).forEach((i) => {
    if (!imports[i]) {
      return;
    }

    const dependencies = [...imports[i]];
    let prefix = "{ ";
    let middle = " ";
    let suffix = " }";

    if (dependencies.length > maxImportsInline) {
      prefix = `{\n${indentation}`;
      middle = `\n${indentation}`;
      suffix = "\n}";
    }
    else if (i.startsWith("./")) {
      prefix = "";
      middle = "";
      suffix = "";
    }

    strBuilder.push(`import ${prefix}${dependencies.join(`,${middle}`)}${suffix} from ${stringQuotes}${i}${stringQuotes};`);
  });

  return strBuilder.join("\n");
};

const classPropertiesToString = (properties = [], options = {}) => {
  const indentSize = options.indentSize || defaultIndentSize;
  const indentation = indent(indentSize);
  const strBuilder = [];

  strBuilder.push(`${indentation}//`);
  strBuilder.push(`${indentation}// properties`);
  strBuilder.push(`${indentation}//\n`);

  [...properties].forEach((property) => {
    property.decorators.forEach((decorator) => {
      strBuilder.push(`${indentation}${decorator}`);
    });
    strBuilder.push(`${indentation}${property.propertyDefinition}\n`);
  });

  return strBuilder.join("\n");
};

const classRelationshipsToString = (relationships = [], options = {}) => {
  const indentSize = options.indentSize || defaultIndentSize;
  const indentation = indent(indentSize);
  const strBuilder = [];

  strBuilder.push(`${indentation}//`);
  strBuilder.push(`${indentation}// relationships`);
  strBuilder.push(`${indentation}//\n`);

  [...relationships].forEach((relationship, i) => {
    if (i) {
      strBuilder.push("");
    }
    strBuilder.push(`${indentation}${relationship.decorator}`);
    strBuilder.push(`${indentation}${relationship.definition}`);
  });

  return strBuilder.join("\n");
};

//
// export
//
module.exports.indent = indent;
module.exports.dbTypeToTsType = dbTypeToTsType;
module.exports.dbTypeToDataType = dbTypeToDataType;
module.exports.importsToString = importsToString;
module.exports.classPropertiesToString = classPropertiesToString;
module.exports.classRelationshipsToString = classRelationshipsToString;
