// Sample ODIN Forms document used by the forms parser and renderer unit tests.
export const SIMPLE_FORM = `{$}
odin = "1.0.0"
forms = "1.0.0"
title = "Test Form"
id = "test_form_1"
lang = "en"

{$.page}
width = #8.5
height = #11
unit = "inch"

{page[0]}
{.text.title}
content = "Application"
x = #0.5
y = #0.5
w = #7.5
h = #0.5
font-size = ##18
font-weight = "bold"

{page[0]}
{.line.header_rule}
x1 = #0.5
y1 = #1.1
x2 = #8
y2 = #1.1
stroke = "#000000"
stroke-width = #0.5

{page[0]}
{.field.insured_name}
type = "text"
label = "Insured Name"
x = #0.5
y = #1.5
w = #3
h = #0.3
bind = @policy.insured_name
required = ?true

{page[0]}
{.field.active}
type = "checkbox"
label = "Active Policy"
x = #0.5
y = #2
w = #0.2
h = #0.2
bind = @policy.active

{page[0]}
{.rect.section_box}
x = #0.5
y = #2.5
w = #7.5
h = #3
fill = "#f5f5f5"
stroke = "#cccccc"
rx = #0.1
ry = #0.1
`;
