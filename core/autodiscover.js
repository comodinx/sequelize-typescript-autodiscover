"use strict";

// inspired by sequelize-typescript-auto https://github.com/YES-Lee/sequelize-typescript-auto

//
// imports
//
require("colors");

const _ = require("lodash");
const fs = require("fs");
const ora = require("ora");
const path = require("path");
const async = require("async");
const helpers = require("./helpers");
const pluralize = require("pluralize");
const Sequelize = require("sequelize");

//
// constants
//
const defaultNormalizeReletionshipName = ["true", "1"].includes(String(process.env.AUTODISCOVER_NORMALIZE_RELETIONSHIP_NAME).toLowerCase()); ;
const defaultNestJsSwaggerSupport = ["true", "1"].includes(String(process.env.AUTODISCOVER_NESTJS_SWAGGER_SUPPORT).toLowerCase());
const defaultCustomModelImport = process.env.AUTODISCOVER_CUSTOM_MODEL_IMPORT;
const defaultCustomModelName = process.env.AUTODISCOVER_CUSTOM_MODEL_NAME || "Model";
const defaultMaxImportsInline = +(process.env.AUTODISCOVER_MAX_IMPORTS_INLINE || 4);
const defaultStringQuotes = process.env.AUTODISCOVER_STRING_QUOTES || "\"";
const defaultIndentSize = +(process.env.AUTODISCOVER_INDENT_SIZE || 2);

const defaultDescriptionResolver = () => {};

const defaultDescriptionResolvers = {
  id: () => 'Unique Identifier',
  created_at: ({ className }) => `${_.startCase(className)} created date at`,
  createdAt: ({ className }) => `${_.startCase(className)} created date at`,
  updated_at: ({ className }) => `${_.startCase(className)} updated date at`,
  updatedAt: ({ className }) => `${_.startCase(className)} updated date at`,
  deleted_at: ({ className }) => `${_.startCase(className)} deleted date at`,
  deletedAt: ({ className }) => `${_.startCase(className)} deleted date at`,
  defaults: ({ className, columnName }) => {
    const field = columnName.replace(/_/g, ' ')

    if (columnName.startsWith('id_') || columnName.endsWith('_id')) {
      return `Unique ${_.startCase(field.replace('id ', ''))} Identifier`;
    }
    return `${_.startCase(className)} ${field}`;
  },
}

const defaultOptions = {
  discover: {
    nestJsSwaggerSupport: defaultNestJsSwaggerSupport,
    normalizeReletionshipName: defaultNormalizeReletionshipName,
    customModelImport: defaultCustomModelImport,
    customModelName: defaultCustomModelName,
    maxImportsInline: defaultMaxImportsInline,
    stringQuotes: defaultStringQuotes,
    indentSize: defaultIndentSize,
    descriptions: defaultDescriptionResolvers,
  },
};

//
// classes
//
class SequelizeTypescriptAutodiscover {
  constructor (options) {
    this.options = _.defaultsDeep({}, options || {}, defaultOptions);

    if (!this.options.database && !this.options.db) {
      throw new Error("Database discoverer need options.database for connect with database.");
    }
    if (!this.options.discover) {
      throw new Error("Database discoverer need options.discover for find definitions of each tables.");
    }

    this.data = {
      tables: {},
      definitions: {},
    };

    this.queuePendingRelationships = new Set([]);
  }

  async run () {
    await this.connect();
    return await this.discover();
  }

  async connect () {
    const spinner = ora("connecting").start();

    this.sequelize = new Sequelize(this.options.database || this.options.db);
    this.queryInterface = this.sequelize.getQueryInterface();

    spinner.succeed("connected");
  }

  async discover () {
    const spinner = ora("discovering").start();

    // Find all table sequelize definitions on the database.
    this.data.tables = await this.getTables();

    // Resolve all table definitions.
    await this.resolveDefinitions();

    // Resolve all relationship definitions.
    await this.resolveRelationships();

    // Write all entities/models
    await this.cleanIfNecesary();

    // Resolve index.
    await this.resolveIndex();

    // Write all entities/models
    await this.write();

    spinner.succeed("bye");
  }

  async getTables () {
    const spinner = ora("discover tables 🔎...").start();

    // Find all table definitions with sequelize from the database.
    const tableNames = await this.getTableNames();
    const tableStructures = await Promise.all(tableNames.map((tableName) => this.queryInterface.describeTable(tableName)));
    const tableIndexes = await Promise.all(tableNames.map((tableName) => this.queryInterface.showIndex(tableName)));
    const tableForeignKeys = await Promise.all(tableNames.map((tableName) => this.queryInterface.getForeignKeyReferencesForTable(tableName)));

    const tables = {};
    tableNames.forEach((tableName, i) => {
      tables[tableName] = {
        structures: tableStructures[i],
        indexes: tableIndexes[i],
        foreignKeys: tableForeignKeys[i],
      };
    });

    this.sequelize.close();

    spinner.succeed(`🔎 found ${Object.keys(tables).length} tables`);
    return tables;
  }

  async getTableNames () {
    // TODO: check all dialects https://github.com/sequelize/sequelize/issues/11451
    const tableNames = await this.queryInterface.showAllTables();
    const skipTables = this.options.discover.skipTables;
    const tables = this.options.discover.tables;

    const allTables = _.map(tableNames, (tableName) => (
      _.isPlainObject(tableName) ? tableName.tableName : tableName
    ));

    if (_.isArray(tables)) {
      const diff = _.difference(tables, allTables);

      if (diff.length) {
        throw new Error(`Table/s not found ${JSON.stringify(diff)}`);
      }
      return tables;
    }

    if (_.isArray(skipTables)) {
      const diff = _.difference(skipTables, allTables);

      if (diff.length) {
        throw new Error(`Table/s not found ${JSON.stringify(skipTables)}`);
      }
      return _.difference(allTables, skipTables);
    }

    return allTables;
  }

  async resolveDefinitions () {
    const spinner = ora("📋 resolve tables definitions").start();

    return new Promise((resolve, reject) => {
      const iterator = async (definitions, tableName) => {
        const table = this.data.tables[tableName];
        table.name = tableName;

        const definition = await this.resolveDefinition(table);
        definitions[definition.name] = definition;
        return definitions;
      };

      const callback = (error, definitions) => {
        if (error) {
          console.error("Error on resolve tables definitions", error);
          return reject(error);
        }

        spinner.succeed("📋 tables definitions resolved successfully");
        this.data.definitions = definitions;
        return resolve(this.data);
      };

      async.reduce(Object.keys(this.data.tables), /* definitions map */ {}, iterator, callback);
    });
  }

  resolveDefinition (table) {
    const spinner = ora(`⚙️  generating definition for ${table.name.blue}`).start();

    const name = table.name;
    const fieldName = pluralize.singular(_.camelCase(name));
    const importName = `./${fieldName}`;
    const className = _.upperFirst(fieldName);
    const definition = {
      name,
      fieldName,
      importName,
      className,
    };

    definition.imports = {
      "sequelize-typescript": new Set(["Table", "Column"])
    };

    if (this.options.discover.nestJsSwaggerSupport) {
      definition.imports["@nestjs/swagger"] = ["ApiProperty"];
    }

    if (this.options.discover.customModelImport) {
      definition.imports[this.options.discover.customModelImport] = [this.options.discover.customModelName];
    }
    else {
      definition.imports["sequelize-typescript"].add("Model");
    }

    definition.classDecorators = [
      `@Table({ tableName: "${name}", timestamps: false })`,
    ];
    definition.classDefinitionStart = `export${this.options.discover.defaultExport ? " default" : ""} class ${className} extends Model<${className}> {`;
    definition.classDefinitionEnd = "}";

    // generate columns
    const columns = Object.keys(table.structures);
    definition.classProperties = [];

    columns.forEach(columnName => {
      const columnStructure = table.structures[columnName];
      const columnDefinition = {};

      columnDefinition.decorators = [];

      if (this.options.discover.nestJsSwaggerSupport) {
        const descriptionResolver = (
          columnStructure.comment ||
          this.options.discover.descriptions?.[columnName] ||
          this.options.discover.descriptions?.defaults ||
          defaultDescriptionResolver
        );

        const comment = _.isFunction(descriptionResolver) ? descriptionResolver({ className, columnName }) : descriptionResolver;

        if (comment) {
          columnDefinition.decorators.push(`@ApiProperty({ description: "${comment.replace(/\n/g, " ")}" })`);
        }
      }

      if (columnStructure.primaryKey) {
        columnDefinition.decorators.push("@PrimaryKey");
        definition.imports["sequelize-typescript"].add("PrimaryKey");
      }

      if (columnStructure.autoIncrement) {
        columnDefinition.decorators.push("@AutoIncrement");
        definition.imports["sequelize-typescript"].add("AutoIncrement");
      }

      columnDefinition.decorators.push(`@AllowNull(${columnStructure.allowNull})`);
      definition.imports["sequelize-typescript"].add("AllowNull");

      if (columnStructure.unique) {
        columnDefinition.decorators.push("@Unique");
      }

      if (columnStructure.defaultValue) {
        columnDefinition.decorators.push(`@Default(sequelize.literal("${columnStructure.defaultValue}"))`);
        definition.imports["sequelize-typescript"].add("Default");
        definition.imports.sequelize = definition.imports.sequelize || new Set([]);
        definition.imports.sequelize.add("liretal");
      }

      if (columnName === "created_at" || columnName === "createdAt") {
        columnDefinition.decorators.push("@CreatedAt");
        definition.imports["sequelize-typescript"].add("CreatedAt");
      }
      if (columnName === "updated_at" || columnName === "updatedAt") {
        columnDefinition.decorators.push("@UpdatedAt");
        definition.imports["sequelize-typescript"].add("UpdatedAt");
      }
      if (columnName === "deleted_at" || columnName === "deletedAt") {
        columnDefinition.decorators.push("@DeletedAt");
        definition.imports["sequelize-typescript"].add("DeletedAt");
      }

      const foreignKey = table.foreignKeys?.find(foreignKey => foreignKey.columnName === columnName);

      if (foreignKey) {
        const relationName = pluralize.singular(foreignKey.referencedTableName);

        definition.classRelationships = definition.classRelationships || [];

        if (!_.find(definition.classRelationships, ["relationName", relationName])) {
          let relationFieldName = _.camelCase(relationName);
          const relationImportName = `./${relationFieldName}`;
          const relationClassName = _.upperFirst(relationFieldName);

          if (this.options.discover.normalizeReletionshipName) {
            if (relationFieldName.startsWith(definition.fieldName)) {
              relationFieldName = _.lowerFirst(relationFieldName.replace(definition.fieldName, ""));
            }
          }

          columnDefinition.decorators.push(`@ForeignKey(() => ${relationClassName})`);
          definition.imports[relationImportName] = definition.imports[relationImportName] || [];
          definition.imports[relationImportName].push(relationClassName);
          definition.imports["sequelize-typescript"].add("ForeignKey");
          definition.imports["sequelize-typescript"].add("BelongsTo");

          definition.classRelationships = definition.classRelationships || [];
          definition.classRelationships.push({
            relationName,
            relationFieldName,
            relationClassName,
            relationImportName,
            decorator: `@BelongsTo(() => ${relationClassName})`,
            definition: `${relationFieldName}?: ${relationClassName};`,
          });
        }
      }

      columnDefinition.decorators.push(`@Column${columnName.includes("_") ? `({ field: "${columnName}" })` : ""}`);
      columnDefinition.propertyDefinition = `${_.camelCase(columnName)}${columnStructure.allowNull ? "?" : ""}: ${helpers.dbTypeToTsType(columnStructure.type)};`;

      definition.classProperties.push(columnDefinition);

      if (table.foreignKeys?.length) {
        table.foreignKeys.forEach(foreignKey => this.queuePendingRelationships.add({
          tableName: foreignKey.referencedTableName,
          referencedTableName: table.name,
          foreignKey,
        }));
      }
    });

    spinner.succeed(`⎯  definition for ${table.name.blue} generated successfully`);
    return definition;
  }

  async resolveRelationships () {
    if (!this.queuePendingRelationships.size) {
      return;
    }

    const spinner = ora("🤝 resolve relationships definitions").start();

    return new Promise((resolve, reject) => {
      const iterator = async (relationship) => {
        const definition = this.data.definitions[relationship.tableName];
        const relationName = pluralize.singular(relationship.referencedTableName);

        if (!definition) {
          return;
        }

        definition.classRelationships = definition.classRelationships || [];

        if (!_.find(definition.classRelationships, ["relationName", relationName])) {
          let relationFieldName = _.camelCase(relationName);
          const relationImportName = `./${relationFieldName}`;
          const relationClassName = _.upperFirst(relationFieldName);

          if (this.options.discover.normalizeReletionshipName) {
            if (relationFieldName.startsWith(definition.fieldName)) {
              relationFieldName = _.lowerFirst(relationFieldName.replace(definition.fieldName, ""));
            }
          }

          definition.imports[relationImportName] = definition.imports[relationImportName] || [];
          definition.imports[relationImportName].push(relationClassName);
          definition.imports["sequelize-typescript"].add("HasMany");

          definition.classRelationships.push({
            relationName,
            relationFieldName,
            relationClassName,
            relationImportName,
            decorator: `@HasMany(() => ${relationClassName})`,
            definition: `${pluralize(relationFieldName)}?: ${relationClassName}[];`,
          });
        }

        return definition;
      };

      const callback = (error) => {
        if (error) {
          console.error("Error on resolve relationship definitions", error);
          return reject(error);
        }

        spinner.succeed("🤝 relationships definitions resolved successfully");
        return resolve(this.data);
      };

      async.each([...this.queuePendingRelationships], iterator, callback);
    });
  }

  async cleanIfNecesary () {
    if (!this.options.discover.clean) {
      return;
    }

    const spinner = ora("🗑️  clean directory").start();
    const dirPath = path.resolve(this.options.discover.output);

    fs.rmSync(dirPath, { recursive: true, force: true });

    spinner.succeed("🗑️  clean directory successfully");
  }

  async resolveIndex () {
    const spinner = ora("🗂️  generating index").start();

    if (!fs.existsSync(path.resolve(this.options.discover.output))) {
      fs.mkdirSync(path.resolve(this.options.discover.output));
    }

    return new Promise((resolve, reject) => {
      const indexBuilder = [];

      Object.keys(this.data.definitions).forEach(definitionName => {
        const definition = this.data.definitions[definitionName];
        const exportClass = this.options.discover.defaultExport ? `{ default as ${definition.className} }` : `*`;

        indexBuilder.push(`export ${exportClass} from "${definition.importName}";`);
      });
      indexBuilder.push("");

      const filePath = path.resolve(path.join(this.options.discover.output, "index.ts"));
      const data = new Uint8Array(Buffer.from(indexBuilder.join("\n")));

      fs.writeFileSync(filePath, data, { encoding: "utf8" });

      spinner.succeed();
      return resolve(this.data);
    });
  }

  async write () {
    const spinner = ora("💾 writing files").start();

    if (!fs.existsSync(path.resolve(this.options.discover.output))) {
      fs.mkdirSync(path.resolve(this.options.discover.output));
    }

    return new Promise((resolve, reject) => {
      const iterator = async (definition) => {
        const filePath = path.resolve(path.join(this.options.discover.output, `${definition.fieldName}.ts`));
        const data = new Uint8Array(Buffer.from(this.buildModelFile(definition)));

        fs.writeFileSync(filePath, data, { encoding: "utf8" });
      };

      const callback = error => {
        if (error) {
          console.error("Error on write definition files", error);
          return reject(error);
        }

        spinner.succeed();
        return resolve(this.data);
      };

      async.eachOf(this.data.definitions, iterator, callback);
    });
  }

  buildModelFile (definition) {
    const builder = [];

    builder.push(helpers.importsToString(definition.imports, this.options.discover));
    builder.push("");
    builder.push(definition.classDecorators.join("\n"));
    builder.push(definition.classDefinitionStart);
    builder.push(helpers.classPropertiesToString(definition.classProperties, this.options.discover));
    if (definition.classRelationships) {
      builder.push(helpers.classRelationshipsToString(definition.classRelationships, this.options.discover));
    }
    builder.push(definition.classDefinitionEnd);
    builder.push("");

    return builder.join("\n");
  }
}

module.exports = SequelizeTypescriptAutodiscover;
