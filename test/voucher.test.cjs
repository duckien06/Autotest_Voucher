const test = require("node:test");
const assert = require("node:assert/strict");

// Hàm gốc từ đề bài.
function applyVoucher(order, voucher) {
  if (voucher.expireAt > Date.now()) {
    if (order.total >= voucher.minOrder) {
      if (voucher.usedCount < voucher.maxUses) {
        const discount = (order.total * voucher.percent) / 100;
        order.total = order.total - discount;
        voucher.usedCount = voucher.usedCount + 1;
        return { success: true, pay: order.total };
      }
    }
  }
  return { success: false, pay: order.total };
}

//BUG B1
test("B1 - Chỉ một đơn được dùng lượt cuối của SALE10", async () => {
  const storedVoucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 99,
    expireAt: Date.now() + 60_000,
  };

  let allowProcessing;
  const bothRequestsHaveRead = new Promise((resolve) => {
    allowProcessing = resolve;
  });

  async function redeem(order) {
    const snapshot = { ...storedVoucher };
    await bothRequestsHaveRead;

    const result = applyVoucher(order, snapshot);
    if (result.success) {
      storedVoucher.usedCount = snapshot.usedCount;
    }
    return result;
  }

  const requestA = redeem({ userId: "USER_A", total: 200000 });
  const requestB = redeem({ userId: "USER_B", total: 300000 });

  // Cả hai yêu cầu đã đọc usedCount = 99 trước khi xử lý tiếp.
  allowProcessing();

  const results = await Promise.all([requestA, requestB]);

  assert.deepEqual(
    {
      successfulRequests: results.filter((result) => result.success).length,
      usedCount: storedVoucher.usedCount,
    },
    { successfulRequests: 1, usedCount: 100 },
  );
});

//BUG B2
test("B2 - Xem trước giá giữ nguyên dữ liệu đầu vào", () => {
  const order = { userId: "USER_A", total: 200000 };
  const voucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 10,
    expireAt: Date.now() + 60_000,
  };

  const originalOrder = { ...order };
  const originalVoucher = { ...voucher };
  const result = applyVoucher(order, voucher);

  assert.deepEqual(
    { result, order, voucher },
    {
      result: { success: true, pay: 180000 },
      order: originalOrder,
      voucher: originalVoucher,
    },
  );
});

//BUG B3
for (const percent of [150, -10]) {
  test(`B3 - Từ chối voucher có percent = ${percent}`, () => {
    const order = { userId: "USER_A", total: 200000 };
    const voucher = {
      code: "SALE",
      percent,
      minOrder: 100000,
      maxUses: 100,
      usedCount: 10,
      expireAt: Date.now() + 60_000,
    };

    const originalOrder = { ...order };
    const originalVoucher = { ...voucher };

    const result = applyVoucher(order, voucher);

    assert.deepEqual(
      { result, order, voucher },
      {
        result: { success: false, pay: 200000 },
        order: originalOrder,
        voucher: originalVoucher,
      },
    );
  });
}

//BUG B4
const b4Cases = [
  { name: "total là chuỗi số", orderInput: { total: "200000" } },
  { name: "minOrder âm", voucherInput: { minOrder: -100000 } },
  { name: "usedCount là chuỗi số", voucherInput: { usedCount: "9" } },
  { name: "maxUses không phải số nguyên", voucherInput: { maxUses: 100.5 } },
];

for (const { name, orderInput, voucherInput } of b4Cases) {
  test(`B4 - Từ chối khi ${name}`, () => {
    const order = { userId: "USER_A", total: 200000, ...orderInput };
    const voucher = {
      code: "SALE10",
      percent: 10,
      minOrder: 100000,
      maxUses: 100,
      usedCount: 9,
      expireAt: Date.now() + 60_000,
      ...voucherInput,
    };

    const originalOrder = { ...order };
    const originalVoucher = { ...voucher };

    const result = applyVoucher(order, voucher);

    assert.deepEqual(
      { success: result.success, order, voucher },
      { success: false, order: originalOrder, voucher: originalVoucher },
    );
  });
}

//BUG B5
test("B5 - Làm tròn số tiền phải trả đến đồng gần nhất", () => {
  const order = { userId: "USER_A", total: 10999 };
  const voucher = {
    code: "SALE15",
    percent: 15,
    minOrder: 10000,
    maxUses: 100,
    usedCount: 10,
    expireAt: Date.now() + 60_000,
  };

  const result = applyVoucher(order, voucher);

  assert.deepEqual(result, { success: true, pay: 9349 });
});

//BUG B6
test("B6 - Một đơn chỉ được áp dụng cùng mã voucher một lần", () => {
  const order = {
    orderId: "ORDER_001",
    userId: "USER_A",
    total: 200000,
  };

  const voucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 10,
    expireAt: Date.now() + 60_000,
  };

  // Hai request có cùng mã đơn, mỗi request gửi lại dữ liệu ban đầu.
  const first = applyVoucher({ ...order }, voucher);
  const second = applyVoucher({ ...order }, voucher);

  assert.deepEqual(
    { first, secondSuccess: second.success, usedCount: voucher.usedCount },
    {
      first: { success: true, pay: 180000 },
      secondSuccess: false,
      usedCount: 11,
    },
  );
});

//BUG B7
test("B7 - Từ chối expireAt là chuỗi timestamp", () => {
  const order = { userId: "USER_A", total: 200000 };
  const voucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 10,
    expireAt: String(Date.now() + 60_000),
  };

  const result = applyVoucher(order, voucher);

  assert.deepEqual(
    { result, total: order.total, usedCount: voucher.usedCount },
    {
      result: { success: false, pay: 200000 },
      total: 200000,
      usedCount: 10,
    },
  );
});

//BUG B8
test("B8 - Xử lý an toàn khi thiếu đơn hàng", () => {
  const voucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 10,
    expireAt: Date.now() + 60_000,
  };

  let result;
  assert.doesNotThrow(() => {
    result = applyVoucher(null, voucher);
  });

  assert.equal(result.success, false);
});

test("B8 - Xử lý an toàn khi thiếu voucher", () => {
  const order = { userId: "USER_A", total: 200000 };

  let result;
  assert.doesNotThrow(() => {
    result = applyVoucher(order, null);
  });

  assert.equal(result.success, false);
  assert.equal(result.pay, 200000);
});

//BUG 9
test("B9 - Chưa ghi nhận lượt dùng khi đơn chưa thanh toán", () => {
  const order = { userId: "USER_A", total: 200000 };
  const voucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 99,
    expireAt: Date.now() + 60_000,
  };

  const result = applyVoucher(order, voucher);

  assert.equal(result.success, true);
  assert.equal(result.pay, 180000);
  assert.equal(voucher.usedCount, 99);
});

//BUG 10
test("B10 - Trả lý do khi voucher đã hết hạn", () => {
  const order = { userId: "USER_A", total: 200000 };
  const voucher = {
    code: "SALE10",
    percent: 10,
    minOrder: 100000,
    maxUses: 100,
    usedCount: 10,
    expireAt: Date.now() - 60_000,
  };

  const result = applyVoucher(order, voucher);

  assert.equal(result.success, false);
  assert.equal(result.pay, 200000);
  assert.equal(result.reason, "VOUCHER_EXPIRED");
});
