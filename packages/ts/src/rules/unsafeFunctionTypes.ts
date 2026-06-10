import ts from "typescript";

import {
	getTSNodeRange,
	typescriptLanguage,
	type AST,
	type Checker,
	type TypeScriptFileServices,
} from "@flint.fyi/typescript-language";

import { ruleCreator } from "./ruleCreator.ts";

function isReferenceToGlobalFunction(
	node: ts.Identifier,
	program: ts.Program,
	typeChecker: Checker,
): boolean {
	const declarations =
		typeChecker.getSymbolAtLocation(node)?.getDeclarations() ?? [];

	return declarations.some((declaration) => {
		const declarationFile = declaration.getSourceFile();
		return (
			declarationFile.hasNoDefaultLib ||
			program.isSourceFileDefaultLibrary(declarationFile)
		);
	});
}

function isTypePositionHeritageClause(node: AST.HeritageClause): boolean {
	return (
		node.token === ts.SyntaxKind.ImplementsKeyword ||
		node.parent.kind === ts.SyntaxKind.InterfaceDeclaration
	);
}

export default ruleCreator.createRule(typescriptLanguage, {
	about: {
		description:
			"Reports usages of the unsafe `Function` type, which accepts any arguments and returns `any`.",
		id: "unsafeFunctionTypes",
		presets: ["logical", "logicalStrict"],
	},
	messages: {
		unsafeFunctionType: {
			primary:
				"The `Function` type accepts any function-like value, providing no type safety when calling it.",
			secondary: [
				"TypeScript's built-in `Function` type allows being called with any number of arguments and returns the unsafe `any` type.",
				"`Function` also matches classes and plain objects that happen to possess all properties of the `Function` class, not just callable functions.",
			],
			suggestions: [
				"Prefer an explicit function type that describes the parameters and return type, such as `() => void`.",
			],
		},
	},
	setup(context) {
		function checkTypeName(
			node: ts.Node,
			{ program, sourceFile, typeChecker }: TypeScriptFileServices,
		) {
			if (
				!ts.isIdentifier(node) ||
				node.text !== "Function" ||
				!isReferenceToGlobalFunction(node, program, typeChecker)
			) {
				return;
			}

			context.report({
				message: "unsafeFunctionType",
				range: getTSNodeRange(node, sourceFile),
			});
		}

		return {
			visitors: {
				HeritageClause: (node, services) => {
					if (isTypePositionHeritageClause(node)) {
						for (const type of node.types) {
							checkTypeName(type.expression, services);
						}
					}
				},
				TypeReference: (node, services) => {
					checkTypeName(node.typeName, services);
				},
			},
		};
	},
});
