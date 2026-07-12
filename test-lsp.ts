/**
 * LSP Test File - 用于测试 LSP 能力的示例代码
 *
 * 测试方法：
 * 1. 打开此文件
 * 2. 在对话中让 LLM 测试 LSP 工具
 * 3. 观察结果
 *
 * 示例命令：
 * - "帮我查看 add 函数的定义"
 * - "查找 user 变量的所有引用"
 * - "获取 test.ts 的文档符号"
 * - "查看 User 接口的类型信息"
 */

// ── 变量定义 ──
const greeting: string = "Hello, World!";
const PI: number = 3.14159;
let counter: number = 0;

// ── 接口定义 ──
interface User {
  name: string;
  age: number;
  email?: string;
  greet(): string;
}

interface Config {
  apiUrl: string;
  timeout: number;
  retries: number;
}

// ── 类型定义 ──
type Status = "active" | "inactive" | "pending";
type Callback = (data: string) => void;
type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
};

// ── 类定义 ──
class Calculator {
  private result: number = 0;

  add(a: number, b: number): number {
    this.result = a + b;
    return this.result;
  }

  subtract(a: number, b: number): number {
    this.result = a - b;
    return this.result;
  }

  multiply(a: number, b: number): number {
    this.result = a * b;
    return this.result;
  }

  getResult(): number {
    return this.result;
  }

  reset(): void {
    this.result = 0;
  }
}

// ── 函数定义 ──
function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return a / b;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 箭头函数 ──
const double = (x: number): number => x * 2;
const square = (x: number): number => x * x;
const greet = (name: string): string => `Hello, ${name}!`;

// ── 对象和数组 ──
const user: User = {
  name: "Alice",
  age: 30,
  email: "alice@example.com",
  greet() {
    return `Hi, I'm ${this.name}`;
  },
};

const users: User[] = [
  { name: "Alice", age: 30, greet: () => "Hi, I'm Alice" },
  { name: "Bob", age: 25, greet: () => "Hi, I'm Bob" },
  { name: "Charlie", age: 35, greet: () => "Hi, I'm Charlie" },
];

const numbers: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── 枚举 ──
enum Color {
  Red = "RED",
  Green = "GREEN",
  Blue = "BLUE",
}

enum Direction {
  Up = 1,
  Down,
  Left,
  Right,
}

// ── 泛型函数 ──
function identity<T>(arg: T): T {
  return arg;
}

function filterArray<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  return arr.filter(predicate);
}

function mapArray<T, U>(arr: T[], transform: (item: T) => U): U[] {
  return arr.map(transform);
}

// ── 异步函数 ──
async function fetchData(url: string): Promise<ApiResponse<string>> {
  try {
    const response = await fetch(url);
    const data = await response.text();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function processItems(items: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const item of items) {
    await delay(100);
    results.push(item.toUpperCase());
  }
  return results;
}

// ── 使用示例 ──
function main() {
  // 变量使用
  console.log(greeting);
  console.log(PI);
  counter++;

  // 函数调用
  const sum = add(10, 20);
  const diff = subtract(100, 50);
  const product = multiply(5, 5);
  const quotient = divide(100, 4);

  console.log(`Sum: ${sum}`);
  console.log(`Difference: ${diff}`);
  console.log(`Product: ${product}`);
  console.log(`Quotient: ${quotient}`);

  // 类使用
  const calc = new Calculator();
  calc.add(10, 20);
  calc.subtract(50, 10);
  calc.multiply(5, 5);
  console.log(`Calculator result: ${calc.getResult()}`);

  // 箭头函数使用
  console.log(`Double of 5: ${double(5)}`);
  console.log(`Square of 7: ${square(7)}`);
  console.log(greet("World"));

  // 数组操作
  const doubled = mapArray(numbers, double);
  const evens = filterArray(numbers, (n) => n % 2 === 0);
  console.log(`Doubled: ${doubled}`);
  console.log(`Evens: ${evens}`);

  // 对象使用
  console.log(user.greet());
  users.forEach((u) => console.log(u.greet()));

  // 枚举使用
  const favoriteColor: Color = Color.Blue;
  const direction: Direction = Direction.Up;
  console.log(`Favorite color: ${favoriteColor}`);
  console.log(`Direction: ${direction}`);

  // 泛型使用
  const identityResult = identity<string>("hello");
  console.log(`Identity: ${identityResult}`);

  // 格式化日期
  const today = formatDate(new Date());
  console.log(`Today: ${today}`);
}

// ── 导出 ──
export {
  greeting,
  PI,
  counter,
  User,
  Config,
  Status,
  Callback,
  ApiResponse,
  Calculator,
  add,
  subtract,
  multiply,
  divide,
  formatDate,
  delay,
  double,
  square,
  greet,
  user,
  users,
  numbers,
  Color,
  Direction,
  identity,
  filterArray,
  mapArray,
  fetchData,
  processItems,
  main,
};

export default main;
