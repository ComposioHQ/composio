import { RuleTester } from 'oxlint/plugins-dev';

import { noOrDieInServiceConstructionRule } from './no-ordie-in-service-construction.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const imports = `
	import * as Context from "effect/Context";
	import * as Effect from "effect/Effect";
	import * as Layer from "effect/Layer";
`;
const constructionOrDie = { messageId: 'constructionOrDie', data: { member: 'orDie' } };

tester.run('anti-slop-effect/no-ordie-in-service-construction', noOrDieInServiceConstructionRule, {
  valid: [
    `import { Layer } from "effect";
     function build(Layer: OtherLibrary) { return live.pipe(Layer.orDie); }`,
    // orDie inside an operation of the returned service.
    `${imports}
		export class Store extends Context.Service<Store, StoreShape>()("@app/Store", {
			make: Effect.gen(function* () {
				const sql = yield* Sql;
				return {
					find: (id: string) => Effect.gen(function* () {
						return yield* sql.find(id).pipe(Effect.orDie);
					}),
					list: Effect.orDie(sql.list),
				};
			}),
		}) {
			static readonly layer = Layer.effect(this, this.make);
		}`,
    // orDie inside an Effect.fn operation and in an effect make defines without running it.
    `${imports}
		export class Store extends Context.Service<Store, StoreShape>()("@app/Store", {
			make: Effect.gen(function* () {
				const find = Effect.fn("Store.find")(function* (id: string) {
					return yield* lookup(id).pipe(Effect.orDie);
				});
				const unwrap = Effect.fnUntraced(function* (id: string) { return id; }, Effect.orDie);
				const collect = Stream.runCollect(entries).pipe(Effect.orDie);
				return { find, unwrap, collect };
			}),
		}) {
			static readonly layer = Layer.effect(this, this.make);
		}`,
    // orDie outside service construction.
    `${imports}
		const program = Effect.gen(function* () {
			yield* risky.pipe(Effect.orDie);
		});`,
    `${imports}
    class Store extends Context.Service<Store, StoreShape>()("Store", {
      make: Effect.gen(function* () {
        return {
          nested: { later: Effect.gen(function* () { return yield* load.pipe(Effect.orDie); }) },
          [key]: load.pipe(Effect.orDie),
        };
      }),
    }) {}`,
    {
      filename: 'store.test.ts',
      code: `${imports}
			const layer = Store.layer.pipe(Layer.orDie);`,
    },
    // Not Effect's Layer.
    `
		import * as Layer from "other-library";
		const layer = live.pipe(Layer.orDie);`,
  ],
  invalid: [
    {
      code: `${imports}
      class Client extends Context.Service<Client, ClientShape>()("Client", {
        make: Effect.gen(function* () {
          return {
            token: yield* load.pipe(Effect.orDie),
            nested: { token: yield* load.pipe(Effect.orDie) },
            [yield* key.pipe(Effect.orDie)]: true,
          };
        }),
      }) {}`,
      errors: [constructionOrDie, constructionOrDie, constructionOrDie],
    },
    {
      code: `import { Context as Ctx, Effect as Fx, Layer as L } from "effect";
        class Client extends Ctx.Service<Client, {}>()("Client") {
          static make = Fx.gen(function* () {
            yield* load.pipe(Fx.orDie);
            return {};
          });
        }
        const layer = live.pipe(L.orDie);`,
      errors: [constructionOrDie, { messageId: 'layerOrDie' }],
    },
    {
      code: `${imports}
			export class Client extends Context.Service<Client, ClientShape>()("@app/Client", {
				make: Effect.gen(function* () {
					const token = yield* Config.string("TOKEN").pipe(Effect.orDie);
					return { token };
				}),
			}) {
				static readonly layer = Layer.effect(this, this.make);
			}`,
      errors: [constructionOrDie],
    },
    {
      code: `${imports}
			export class Client extends Context.Service<Client, ClientShape>()("@app/Client", {
				make: Effect.gen(function* () {
					return {};
				}).pipe(Effect.orDieWith((error) => error)),
			}) {
				static readonly layer = Layer.effect(this, this.make);
			}`,
      errors: [{ messageId: 'constructionOrDie', data: { member: 'orDieWith' } }],
    },
    {
      code: `${imports}
			export class Database extends Context.Service<Database, DatabaseShape>()("@app/Database") {
				static readonly make = (file: string) => Effect.gen(function* () {
					yield* migrate(file).pipe(Effect.orDie);
					return {};
				});
				static readonly layer = (file: string) => Layer.effect(this, this.make(file));
			}`,
      errors: [constructionOrDie],
    },
    {
      code: `${imports}
			export const live = Layer.effect(Store, Effect.gen(function* () {
				const key = yield* Effect.suspend(() => loadKey.pipe(Effect.orDie));
				return { key };
			}));`,
      errors: [constructionOrDie],
    },
    {
      code: `${imports}
			const logLayer = layerJsonl(path).pipe(Layer.orDie);`,
      errors: [{ messageId: 'layerOrDie' }],
    },
  ],
});
