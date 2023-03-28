# sequelize-typescript-autodiscover

Automatically generate models for sequelize-typescript

>
> sequelize-typescript-autodiscover is an discover database models/entities (TS). Based on sequelize 6.
>

## Index

* [Download & Install][install].
* [How is it used?][how_is_it_used].
* [Tests][tests].

## Download & Install

### NPM
```bash
$ npm install sequelize-typescript-autodiscover
```

### Source code
```bash
$ git clone https://gitlab.com/comodinx/sequelize-typescript-autodiscover.git
$ cd sequelize-typescript-autodiscover
$ npm i
```

## How is it used?

```sh
Usage: sequelize-typescript-autodiscover [options]

Options:
  -V, --version                     output the version number
  -H, --host <host>                 database host
  -d, --database <database>         name of database
  -u, --username <username>         user of database
  -x, --password <password>         password of database
  -p, --port <port>                 port of database (default: 3306)
  -o, --output <dirname>            models output dir (default: "./models")
  -v, --verbose <boolean>           verbose enabled (default: false)
  --dialect <string>                name of dialect (default: "mysql")
  --tables <items>                  list of tables (comma separated values) (ex. "users,roles,permissions,user_roles,role_permissions")
  --skipTables <items>              list of skip tables (comma separated values) (ex. "sequelize_migrations")
  --stringQuotes <string>           string quote (default: "\"")
  --maxImportsInline <number>       indicate number of max imports inline (default: 4)
  --indentSize <number>             indentation size (default: 2)
  --customModelImport <string>      custom model dependency package (default: null) (ex. "@mycompany/core")
  --customModelName <string>        custom model name (default: "Model")
  --nestJsSwaggerSupport            indicate if use @nestjs/swagger on your proyect (default: false)
  --no-defaultExport                indicate if export model as default (default: true)
  --no-normalizeReletionshipName    indicate if is necesary normalizate the relationship name (default: true)
  -h, --help                        output usage information
```

## example by command line

```sh
sequelize-typescript-autodiscover /
 -H localhost /
 -u root /
 -p 123456 /
 -d test /
 -o ".models" /
 --nestJsSwaggerSupport /
 --no-normalizeReletionshipName /
 --indentSize 4
```

## example programmatically

```js
const auto = new SequelizeTypescriptAutodiscover({
  // sequelize conection options
  // for more details, see https://sequelize.org/docs/v6/getting-started/#connecting-to-a-database
  database: {
    database: "localhost",
    username: "root",
    password: "123456",
    dialect: "mysql"
  },
  discover: {
    output: ".models",
    // tables: "users,roles,permissions,user_roles,role_permissions",
    // skipTables: "sequelize_migrations",
    // stringQuotes: "\"",
    // maxImportsInline: 4,
    // indentSize: 2,
    // customModelImport: "@mycompany/core",
    // customModelName: "Model",
    // nestJsSwaggerSupport: false,
    // defaultExport: true,
    // normalizeReletionshipName: true,
  },
});

await auto.run();
```

## Tests

`in progress`

<!-- deep links -->
[install]: #download--install
[how_is_it_used]: #how-is-it-used
[tests]: #tests
