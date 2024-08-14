import libcst as cst
import libcst.matchers as m


class CompressTransformer(cst.CSTTransformer):
    DESCRIPTION = str = "Replaces function body with ..."
    replacement_string = '"$$FUNC_BODY_REPLACEMENT_STRING$$"'

    def __init__(self, keep_constant=True):
        self.keep_constant = keep_constant

    def leave_Module(
        self, original_node: cst.Module, updated_node: cst.Module
    ) -> cst.Module:
        new_body = [
            stmt
            for stmt in updated_node.body
            if m.matches(stmt, m.ClassDef())
            or m.matches(stmt, m.FunctionDef())
            or (
                self.keep_constant
                and m.matches(stmt, m.SimpleStatementLine())
                and m.matches(stmt.body[0], m.Assign())
            )
        ]
        return updated_node.with_changes(body=new_body)

    def leave_ClassDef(
        self, original_node: cst.ClassDef, updated_node: cst.ClassDef
    ) -> cst.ClassDef:
        # Remove docstring in the class body
        new_body = [
            stmt
            for stmt in updated_node.body.body
            if not (
                m.matches(stmt, m.SimpleStatementLine())
                and m.matches(stmt.body[0], m.Expr())
                and m.matches(stmt.body[0].value, m.SimpleString())
            )
        ]
        return updated_node.with_changes(body=cst.IndentedBlock(body=new_body))

    def leave_FunctionDef(
        self, original_node: cst.FunctionDef, updated_node: cst.FunctionDef
    ) -> cst.CSTNode:
        new_expr = cst.Expr(value=cst.SimpleString(value=self.replacement_string))
        new_body = cst.IndentedBlock((new_expr,))
        # another way: replace with pass?
        return updated_node.with_changes(body=new_body)


def get_skeleton(raw_code, keep_constant: bool = True):
    try:
        tree = cst.parse_module(raw_code)
    except:
        return raw_code

    transformer = CompressTransformer(keep_constant=keep_constant)
    modified_tree = tree.visit(transformer)
    code = modified_tree.code
    code = code.replace(CompressTransformer.replacement_string + "\n", "...\n")
    code = code.replace(CompressTransformer.replacement_string, "...\n")
    return code
