"""Build a new checklist workbook. It is not a tab of the old order book."""

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.datavalidation import DataValidation

# name, level as given, how many pieces, group, name in the book
ITEMS = [
    ("Колыбель", 3, 1, "Кровати", "Колыбель (декор)"),
    ("Двуспальная деревенская кровать", 5, 1, "Кровати", "Простая двуспальная кровать (декор)"),
    ("Грубый стол", 1, 1, "Столы", "Грубый стол (декор)"),
    ("Маленький стол", 2, 1, "Столы", "Маленький стол (декор)"),
    ("Деревенский стол", 3, 1, "Столы", "Простой стол (декор)"),
    ("Квадратный стол", 4, 1, "Столы", "Квадратный стол (декор)"),
    ("Длинный стол на козлах", 5, 1, "Столы", "Длинный стол (декор)"),
    ("Деревенский табурет", 2, 1, "Сиденья", "Простой стул (декор)"),
    ("Деревенский стул", 3, 1, "Сиденья", "Простой стул, вар. 2 (декор)"),
    ("Длинная лавка", 3, 1, "Сиденья", "Простая скамья (декор)"),
    ("Маленький ящик", 3, 1, "Сундуки", "В книге нет отдельного ящика 3 уровня"),
    ("Маленький сундук", 3, 1, "Сундуки", "Маленький сундук (декор)"),
    ("Деревенский шкаф", 4, 1, "Сундуки", "Простой шкаф (декор)"),
    ("Настенная полка", 2, 1, "Полки", "Настенная полка (декор)"),
    ("Деревенские полки", 3, 1, "Полки", "Простая полка (декор)"),
    ("Подушка", 1, 2, "Уют", "Подушка (декор)"),
    ("Корзина яблок", 1, 1, "Уют", "Корзина яблок (декор)"),
    ("Корзина хлеба", 1, 1, "Уют", "Корзина хлеба (декор)"),
    ("Оленья шкура", 2, 1, "Уют", "Оленья шкура (декор)"),
    ("Тканый коврик", 3, 1, "Уют", "Ковёр, вар. 1 (декор)"),
    ("Коровья шкура", 3, 1, "Уют", "Коровья шкура (декор)"),
    ("Узорчатый ковёр", 5, 1, "Уют", "Ковёр, вар. 2 (декор)"),
    ("Серая шкура", 3, 1, "Уют", "Серый мех (декор)"),
    ("Покрывало из оленьей шкуры", 4, 2, "Уют", "Покрывало из оленьей шкуры (декор)"),
    ("Приподнятый очаг", 4, 1, "Уют", "Высокий очаг (декор)"),
    ("Рога на щите", 5, 1, "Уют", "Рога на щите (декор)"),
    ("Подвесной котёл", 2, 1, "Свет и стан", "Котёл (декор)"),
    ("Подсвечник", 2, 2, "Свет и стан", "Подсвечник (декор)"),
    ("Фонарь", 5, 1, "Свет и стан", "Нарядный фонарь (декор)"),
    ("Подвесной фонарь", 5, 1, "Свет и стан", "Подвесной фонарь (декор)"),
    ("Букет", 2, 1, "Украшения", "Букет цветов (декор)"),
    ("Венок из листьев", 2, 1, "Украшения", "Венок из хмеля (декор)"),
    ("Ваза", 2, 1, "Украшения", "Ваза (декор)"),
    ("Глиняная кружка", 2, 1, "Украшения", "Кружка (декор)"),
    ("Набросок", 5, 1, "Украшения", "Рисунок (декор), в книге это 3 уровень"),
    ("Молитвенный коврик", 3, 1, "Украшения", "Молитвенный коврик (декор)"),
    ("Широкая ваза", 3, 1, "Украшения", "Широкая ваза (декор)"),
    ("Глиняная посуда", 3, 1, "Украшения", "Керамика (декор)"),
    ("Книга", 3, 1, "Украшения", "Книга (декор)"),
    ("Чернильница с пером", 3, 1, "Украшения", "Чернильница (декор)"),
    ("Настенный полог", 4, 2, "Украшения", "Занавесь (декор)"),
    ("Оленьи рога на щите", 4, 1, "Украшения", "Оленьи рога (декор)"),
    ("Ряд книг", 4, 1, "Украшения", "Стопка книг (декор)"),
    ("Нарядная скатерть", 5, 1, "Украшения", "Нарядная скатерть (декор)"),
    ("Икона Спаса нерукотворного", 5, 1, "Украшения", "Икона, вар. 2 (декор)"),
    ("Череп оленя", 5, 1, "Украшения", "Череп оленя (декор)"),
    ("Карта", 5, 1, "Украшения", "Карта (декор)"),
    ("Песочные часы", 5, 1, "Украшения", "Песочные часы (декор)"),
    ("Мешок муки", 1, 1, "Работа", "Мешок муки (декор)"),
    ("Козлы для седла", 2, 1, "Работа", "Подставка для седла (декор)"),
    ("Маслобойка", 2, 1, "Работа", "Маслобойка (декор)"),
    ("Бочонок с краном", 3, 1, "Работа", "Бочонок с краником (декор)"),
    ("Прилавок", 4, 1, "Работа", "Прилавок (декор)"),
    ("Купеческая полка", 4, 1, "Работа", "Торговая полка (декор)"),
    ("Полка травника", 3, 1, "Работа", "Полка травника (декор)"),
    ("Корзина для дров", 1, 1, "Двор и еда", "Корзина дров (декор)"),
    ("Каравай", 1, 1, "Двор и еда", "Хлеб (декор)"),
    ("Связка лука", 1, 2, "Двор и еда", "Связка лука (декор)"),
    ("Чеснок", 1, 2, "Двор и еда", "Чеснок (декор)"),
    ("Сушеные травы", 1, 3, "Двор и еда", "Пучки трав (декор)"),
    ("Корзина для яиц", 1, 1, "Двор и еда", "Корзина яиц (декор)"),
    ("Мешок для яблок", 1, 1, "Двор и еда", "Мешок яблок (декор)"),
    ("Горшок квашеной капусты", 2, 1, "Двор и еда", "Квашеная капуста (декор)"),
    ("Миска гуляша", 2, 1, "Двор и еда", "Гуляш (декор)"),
    ("Кувшин медовухи", 3, 1, "Двор и еда", "Медовуха (декор)"),
    ("Жареный поросенок", 4, 1, "Двор и еда", "Блюдо со свининой (декор)"),
    ("Миска шкварок", 2, 1, "Двор и еда", "Шкварки (декор)"),
    ("Кувшин", 2, 1, "Двор и еда", "Кувшин (декор)"),
    ("Кувшин для вина", 2, 1, "Двор и еда", "Кувшин вина (декор)"),
    ("Ореховый пирог", 3, 1, "Двор и еда", "Ореховый пирог (декор)"),
]

HEADER_ROW = 5
FIRST = HEADER_ROW + 1

INK = "3A2A1C"
GREEN = "234237"
CREAM = "F6F0E4"
CREAM_2 = "EFE6D4"
DONE = "D7E7D4"
LEFT = "F3DDD0"
LINE = "C8BBA6"
GOLD = "8C6A32"

thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
wrap = Alignment(wrap_text=True, vertical="center")
center = Alignment(horizontal="center", vertical="center", wrap_text=True)


def fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def main() -> None:
    book = Workbook()
    book.calculation = CalcProperties(calcMode="auto", fullCalcOnLoad=True)
    sheet = book.active
    sheet.title = "Список"

    lists = book.create_sheet("Списки")
    lists["A1"] = "Не сделано"
    lists["A2"] = "Сделано"
    lists.sheet_state = "hidden"

    sheet.merge_cells("A1:F1")
    sheet["A1"] = "Дом у дерева — что уже сделано"
    sheet["A1"].font = Font(name="Calibri", size=20, bold=True, color="F6F0E4")
    sheet["A1"].fill = fill(GREEN)
    sheet["A1"].alignment = Alignment(vertical="center", indent=1)
    sheet.row_dimensions[1].height = 36

    sheet["A2"] = "Сделано"
    sheet["B2"] = f'=COUNTIF(E{FIRST}:E500,"Сделано")'
    sheet["C2"] = "из"
    sheet["D2"] = f'=COUNTA(B{FIRST}:B500)'
    sheet["E2"] = "Осталось"
    sheet["F2"] = "=D2-B2"
    for cell, bold in (("A2", False), ("C2", False), ("E2", False)):
        sheet[cell].font = Font(name="Calibri", size=12, color=INK)
        sheet[cell].fill = fill(CREAM)
        sheet[cell].alignment = center
    for cell in ("B2", "D2", "F2"):
        sheet[cell].font = Font(name="Calibri", size=16, bold=True, color=GREEN)
        sheet[cell].fill = fill(CREAM)
        sheet[cell].alignment = center
    sheet.row_dimensions[2].height = 28

    sheet.merge_cells("A3:F3")
    sheet["A3"] = (
        "В столбце «Статус» выберите «Сделано» или «Не сделано». "
        "Если штук несколько, у каждой своя строка. Это отдельная таблица, не страница старой книги заказов."
    )
    sheet["A3"].font = Font(name="Calibri", size=11, italic=True, color=INK)
    sheet["A3"].fill = fill("E7F0E4")
    sheet["A3"].alignment = Alignment(vertical="center", wrap_text=True, indent=1)
    sheet.row_dimensions[3].height = 32

    sheet.row_dimensions[4].height = 8

    headers = ["Группа", "Изделие", "Уровень", "Штука", "Статус", "Строка в книге"]
    for col, title in enumerate(headers, start=1):
        cell = sheet.cell(HEADER_ROW, col, title)
        cell.font = Font(name="Calibri", bold=True, color="F6F0E4")
        cell.fill = fill(GREEN)
        cell.alignment = center
        cell.border = thin
    sheet.row_dimensions[HEADER_ROW].height = 22
    sheet.auto_filter.ref = f"A{HEADER_ROW}:F{HEADER_ROW}"
    sheet.freeze_panes = f"A{FIRST}"
    sheet.auto_filter.ref = f"A{HEADER_ROW}:F500"
    sheet.sheet_view.showGridLines = False
    sheet.page_setup.fitToPage = True
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.page_setup.orientation = "landscape"
    sheet.sheet_properties.tabColor = GREEN
    sheet.oddHeader.left.text = "Дом у дерева"
    sheet.print_title_rows = "1:5"

    rows = []
    for name, level, qty, group, book_name in ITEMS:
        for index in range(1, qty + 1):
            piece = f"{index} из {qty}" if qty > 1 else "1"
            rows.append((group, name, level, piece, book_name))

    for offset, (group, name, level, piece, book_name) in enumerate(rows):
        row = FIRST + offset
        values = [group, name, level, piece, "Не сделано", book_name]
        stripe = CREAM if offset % 2 == 0 else CREAM_2
        for col, value in enumerate(values, start=1):
            cell = sheet.cell(row, col, value)
            cell.font = Font(name="Calibri", size=12, color=INK)
            cell.fill = fill(stripe)
            cell.border = thin
            cell.alignment = center if col in (1, 3, 4, 5) else Alignment(vertical="center", indent=1)
        sheet.row_dimensions[row].height = 22

    last = FIRST + len(rows) - 1
    sheet.auto_filter.ref = f"A{HEADER_ROW}:F{last}"

    check = DataValidation(
        type="list",
        formula1="=Списки!$A$1:$A$2",
        allow_blank=False,
        showDropDown=False,
        showErrorMessage=True,
        errorTitle="Статус",
        error="Выберите «Сделано» или «Не сделано».",
        promptTitle="Статус",
        prompt="Выберите, сделана эта штука или ещё нет.",
        showInputMessage=True,
    )
    check.add(f"E{FIRST}:E{last}")
    sheet.add_data_validation(check)

    sheet.conditional_formatting.add(
        f"E{FIRST}:E{last}",
        FormulaRule(formula=[f'E{FIRST}="Сделано"'], fill=fill(DONE), font=Font(name="Calibri", bold=True, color="1D4A32")),
    )
    sheet.conditional_formatting.add(
        f"E{FIRST}:E{last}",
        FormulaRule(formula=[f'E{FIRST}="Не сделано"'], fill=fill(LEFT), font=Font(name="Calibri", color="6B3A28")),
    )

    widths = {"A": 16, "B": 42, "C": 12, "D": 12, "E": 16, "F": 52, "H": 16, "I": 12, "J": 14}
    for letter, width in widths.items():
        sheet.column_dimensions[letter].width = width

    sheet["H5"] = "Группа"
    sheet["I5"] = "Нужно"
    sheet["J5"] = "Сделано"
    for col in ("H", "I", "J"):
        cell = sheet[f"{col}5"]
        cell.font = Font(name="Calibri", bold=True, color="F6F0E4")
        cell.fill = fill(GOLD)
        cell.alignment = center
        cell.border = thin

    groups = []
    for _, _, _, group, _ in ITEMS:
        if group not in groups:
            groups.append(group)
    for index, group in enumerate(groups):
        row = 6 + index
        sheet.cell(row, 8, group).font = Font(name="Calibri", size=12, color=INK)
        sheet.cell(row, 8).alignment = Alignment(vertical="center", indent=1)
        sheet.cell(row, 8).border = thin
        sheet.cell(row, 9, f'=COUNTIF($A${FIRST}:$A${last},H{row})')
        sheet.cell(row, 10, f'=COUNTIFS($A${FIRST}:$A${last},H{row},$E${FIRST}:$E${last},"Сделано")')
        for col in (9, 10):
            sheet.cell(row, col).font = Font(name="Calibri", size=12, color=INK)
            sheet.cell(row, col).alignment = center
            sheet.cell(row, col).border = thin
        stripe = CREAM if index % 2 == 0 else CREAM_2
        for col in (8, 9, 10):
            sheet.cell(row, col).fill = fill(stripe)

    sheet.oddFooter.right.text = "Статус выбирается в списке ячейки"
    sheet.sheet_view.zoomScale = 120

    book.properties.title = "Дом у дерева — что уже сделано"
    book.properties.creator = "Дом у дерева"

    out = "public/dom-u-dereva-mebel.xlsx"
    book.save(out)
    print(f"{out}: {len(ITEMS)} названий, {len(rows)} строк")


if __name__ == "__main__":
    main()
