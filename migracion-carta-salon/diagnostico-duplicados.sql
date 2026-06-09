-- Pegá esto en SQL Editor para VER los duplicados antes de borrar:
select nombre, count(*) as veces, array_agg(id) as ids, array_agg(orden) as ordenes
from public.menu_items
where tipo='carta'
group by nombre
having count(*) > 1
order by nombre;
