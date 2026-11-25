const pad = n => String(n).padStart(2, '0');
const intIn = (value, min, max, name) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer ${min}-${max}`);
  return value;
};

// Location codes are always 6 characters: room letter, 2-digit cabinet, dash, 2-digit slot.
// A shelf or drawer slot is its number from the top (K06-02); a matrix slot is row digit + column digit (G01-23).
export function cabinetCodes({ room, cabinet, shelves, rows, cols }) {
  if (typeof room !== 'string' || !/^[A-Z]$/.test(room)) throw new RangeError('room must be one capital letter A-Z');
  if ((shelves === undefined) === (rows === undefined && cols === undefined)) throw new RangeError('give either shelves, or rows and cols');
  const prefix = `${room}${pad(intIn(cabinet, 1, 99, 'cabinet'))}-`;
  if (shelves !== undefined) return Array.from({ length: intIn(shelves, 1, 99, 'shelves') }, (_, i) => prefix + pad(i + 1));
  const rowCount = intIn(rows, 1, 9, 'rows');
  const colCount = intIn(cols, 1, 9, 'cols');
  return Array.from({ length: rowCount * colCount }, (_, i) => `${prefix}${Math.floor(i / colCount) + 1}${(i % colCount) + 1}`);
}
