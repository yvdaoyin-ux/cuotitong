/**
 * image-store.js —— 题目图片的存储层
 *
 * 任务书第 3.2 节的要求与实现对照：
 *   - IndexedDB 库 qt-images，store images：{ id, qid, blob, w, h, createdAt }（另存 size 字节数，供统计）
 *   - 存 Blob，不存 base64；绝不放 localStorage（5MB 配额撑不起图片）
 *   - 错题记录只存 imageIds
 *   - 抽象出 ImageStore 接口：内存实现给 Node 测试，浏览器用 IndexedDB 实现
 *
 * 接口约定（**全部方法返回 Promise**，两种实现保持同一契约）：
 *   put(record)                  record 含 { id, qid, blob, w, h, size, createdAt }
 *   get(id)        → record|null record.blob 是原始 Blob
 *   delete(id)
 *   deleteByQid(qid)             删除某道错题的全部图片，返回删除数
 *   listQidPairs() → [{id,qid}]  只读键不读 blob（孤儿清理用，避免把图片全载入内存）
 *   getAll()       → [record]    含 blob，仅「含图片备份」时使用
 *   clear()
 *   count()        → number
 *
 * 降级（任务书 3.5）：IndexedDB 打不开（隐私模式 / file:// 受限 / 配额满）时
 * openImageStore() resolve 为 **null**，由 UI 层隐藏拍照按钮并给出提示——
 * 绝不悄悄退回内存存储（那样图片刷新即丢，用户会以为存上了）。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  var DB_NAME = 'qt-images';
  var STORE = 'images';
  var DB_VERSION = 1;
  var OPEN_TIMEOUT_MS = 4000; // 打开超时按失败处理，不能让整个应用等 IndexedDB

  /* ============================================================
   * 内存实现（Node 测试用；接口同 IndexedDB 实现）
   * ============================================================ */

  function createMemoryStore() {
    var byId = {}; // id → record（record.blob 为 Blob 或测试里的任意对象）

    function delay(value) { return Promise.resolve(value); }

    return {
      kind: 'memory',
      put: function (record) {
        if (!record || typeof record.id !== 'string' || !record.id) {
          return Promise.reject(new Error('图片记录缺少 id'));
        }
        byId[record.id] = record;
        return delay(record.id);
      },
      get: function (id) { return delay(Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null); },
      delete: function (id) {
        var existed = Object.prototype.hasOwnProperty.call(byId, id);
        delete byId[id];
        return delay(existed);
      },
      deleteByQid: function (qid) {
        var n = 0;
        Object.keys(byId).forEach(function (id) {
          if (byId[id].qid === qid) { delete byId[id]; n += 1; }
        });
        return delay(n);
      },
      listQidPairs: function () {
        return delay(Object.keys(byId).map(function (id) {
          return { id: id, qid: byId[id].qid };
        }));
      },
      getAll: function () {
        return delay(Object.keys(byId).map(function (id) { return byId[id]; }));
      },
      clear: function () { byId = {}; return delay(undefined); },
      count: function () { return delay(Object.keys(byId).length); }
    };
  }

  /* ============================================================
   * IndexedDB 实现
   * ============================================================ */

  /** 把 IDBRequest 包成 Promise。 */
  function req(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB 请求失败')); };
    });
  }

  /** 打开数据库（store + qid 索引）。 */
  function openDb(factory) {
    return new Promise(function (resolve, reject) {
      var open = factory.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = function () {
        var db = open.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('qid', 'qid', { unique: false });
        }
      };
      open.onsuccess = function () { resolve(open.result); };
      open.onerror = function () { reject(open.error || new Error('IndexedDB 打开失败')); };
      open.onblocked = function () { reject(new Error('IndexedDB 被其他标签页占用')); };
    });
  }

  /** 带超时保护：IndexedDB 打开超过 4 秒视为不可用。 */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('IndexedDB 打开超时')); }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function createIdbStore(db) {
    function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }
    return {
      kind: 'indexeddb',
      put: function (record) { return req(tx('readwrite').put(record)); },
      get: function (id) { return req(tx('readonly').get(id)).then(function (r) { return r || null; }); },
      delete: function (id) { return req(tx('readwrite').delete(id)).then(function () { return true; }); },
      deleteByQid: function (qid) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, 'readwrite');
          var os = t.objectStore(STORE);
          var idx = os.index('qid');
          var n = 0;
          // 只走游标键，按主键逐个删，避免 getAll 把 blob 全载入内存
          var cursorReq = idx.openKeyCursor(IDBKeyRange.only(qid));
          cursorReq.onsuccess = function () {
            var cursor = cursorReq.result;
            if (cursor) { os.delete(cursor.primaryKey); n += 1; cursor.continue(); }
          };
          cursorReq.onerror = function () { reject(cursorReq.error); };
          t.oncomplete = function () { resolve(n); };
          t.onerror = function () { reject(t.error); };
        });
      },
      listQidPairs: function () {
        return new Promise(function (resolve, reject) {
          var out = [];
          var t = db.transaction(STORE, 'readonly');
          // 必须走 qid 索引：openKeyCursor 在索引上，key=qid、primaryKey=id，
          // 全程不读记录本体（blob 不会被载入内存）
          var cursorReq = t.objectStore(STORE).index('qid').openKeyCursor();
          cursorReq.onsuccess = function () {
            var cursor = cursorReq.result;
            if (cursor) {
              out.push({ id: cursor.primaryKey, qid: cursor.key });
              cursor.continue();
            }
          };
          cursorReq.onerror = function () { reject(cursorReq.error); };
          t.oncomplete = function () { resolve(out); };
        });
      },
      getAll: function () { return req(tx('readonly').getAll()); },
      clear: function () { return req(tx('readwrite').clear()); },
      count: function () { return req(tx('readonly').count()); }
    };
  }

  /**
   * 打开图片存储。
   * @param {IDBFactory} [injectedIdb] 测试可注入假的 factory（如始终抛异常的降级模拟）
   * @returns {Promise<ImageStore|null>} 不可用时 resolve null，绝不 reject
   */
  function openImageStore(injectedIdb) {
    var factory = injectedIdb ||
      (typeof global.indexedDB !== 'undefined' ? global.indexedDB : null);
    if (!factory) return Promise.resolve(null);
    return withTimeout(
      openDb(factory).then(createIdbStore),
      OPEN_TIMEOUT_MS
    ).catch(function () { return null; });
  }

  /* ============================================================
   * 孤儿清理（两种实现共用）
   * ============================================================ */

  /**
   * 删除 qid 不在存活错题集合里的图片。
   * 应用启动时调用一次；删除错题的 UI 路径也会即时删图，这里兜底
   * （比如上次会话在「已保存错题但图片尚未提交」的间隙被关掉）。
   * @param {ImageStore} store
   * @param {Object<string,boolean>} liveQids 存活错题 id 集合
   * @returns {Promise<number>} 删除数
   */
  function cleanupOrphans(store, liveQids) {
    if (!store) return Promise.resolve(0);
    return store.listQidPairs().then(function (pairs) {
      var dead = pairs.filter(function (p) { return !liveQids[p.qid]; });
      var done = 0;
      // 串行删，避免一次事务塞太多删除请求
      var chain = Promise.resolve();
      dead.forEach(function (p) {
        chain = chain.then(function () {
          return store.delete(p.id).then(function () { done += 1; });
        });
      });
      return chain.then(function () { return done; });
    });
  }

  QT.imageStoreLib = {
    DB_NAME: DB_NAME,
    STORE: STORE,
    createMemoryStore: createMemoryStore,
    openImageStore: openImageStore,
    cleanupOrphans: cleanupOrphans
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
