
说来惭愧, 笔者作为一名有好几年开发经验的高级前端, 却一直对浏览器渲染的执行细节一知半解. 最近拜读霍大的《Vue.js设计与实现》, 感觉豁然开朗, 对之前工作中发现的很多渲染问题顿时了悟, 趁现在还有印象, 赶紧记录一下, 也希望能给有类似困惑的同行有所启发.

> 《Vue.js设计与实现》是一本难得的好书, 值得每个Vuer都看看, 强烈推荐!

## 为啥会有误解
笔者刚开始从事前端开发的时候, Vue/React等MVVM框架还没有现在这么流行, 还有很多项目是基于jQuery开发的. 那时的DOM处理还比较原始, DOM更新通常情况下要自己手动处理, 需要异步时也不是用`Primise`等微任务, 都是用`setTimeout(fn, 0)`搞定. 所以基于事件循环的处理步骤是很明确的, 就是一个事件循环一次dom更新, 没什么困惑.

后面开始接触`React`/`Vue`, 感觉鸟枪换炮了, 开发体验如开火箭, 但也带了一个问题: **框架封装了直接操作浏览器的步骤, 也隔绝了对基础操作的感知**, 导致概念的模糊化. 

就目前从网上看到的关于nextTick的讨论, 貌似有类似误解的同学还不少. 所以先澄清几个误区, 然后我们自己实现一个最小化的Vue demo来辅助nextTick.

## 误区一: nextTick是用于DOM渲染完成后获取最终属性

Vue官方文档中对于nextTick有如下一句[解释](https://cn.vuejs.org/guide/essentials/reactivity-fundamentals.html#dom-update-timing): 
```
若要等待一个状态改变后的 DOM 更新完成，你可以使用 nextTick() 这个全局 API：
```
对此容易产生一个误会: nextTick是用于获取dom更新后的DOM属性. 但实际情况并非如此.

首先, 对dom的更新有所了解的同学应该知道, 在一次事件循环中, 关于DOM的更新流程如下: 
同步任务 > 微任务 > DOM渲染 > 宏任务
然而, 一个容易混淆的概念是, 上述的"DOM渲染"实际指的是浏览器的GUI渲染进程, DOM操作本身其实是同步的,其属性可以直接在下一行获得. 实践是检验真理的唯一标准,我们先写个实践代码测试一下: 
```
<!DOCTYPE html>
<html lang="en">
<body>
  <script>
    // scyn -> micro -> render -> macro
    document.body.style = 'background: blue';
    console.log('同步任务: 当前背景色: ', document.body.style.background);
    alert(document.body.style.background)
    Promise.resolve().then(() => {
      document.body.style = 'background: green';
      console.log('微任务: 当前背景色: ', document.body.style.background);
      alert(document.body.style.background)
    })
    setTimeout(() => {
      document.body.style = 'background: red';
      console.log('宏任务: 当前背景色: ', document.body.style.background);
      alert(document.body.style.background)
    }, 0)
  </script>
</body>
</html>
```

在浏览器运行上述html代码, 使用alert中断渲染进程, 可见修改背景色时背景色, 同步任务和微任务的背景色并不会立刻渲染, 而是会集中到宏任务执行之前, body的背景色才会渲染出来; 而宏任务的背景色则会立刻渲染(因为已经进入了下一个事件循环了). 这个符合上述`同步任务 > 微任务 > DOM渲染 > 宏任务`的预期. 但是不管同步任务\微任务\宏任务, 但alert中断执行时, 控制台都能正确打印出当前背景色的值. 这说明即使在同一个事件循环中, DOM操作本身也是同步的, 只是DOM渲染会推迟到一次事件循环的最后再执行. 

由此可推测, 浏览器的对待页面的正确“姿势”是先计算后渲染. 

在本质上， DOM也只是一个对象而已，在修改DOM对象时，UI的修改（包括添加节点、修改颜色、修改节点内容等）会立即更新应用程序的状态, 然后等到微任务队列清空后，事件循环会检查当前是否需要重新渲染UI，如果需要则渲染UI视图. 所以在数据层面上，你的下一行代码就可以拿到DOM的修改结果, 压根不需要一个nextTick辅助. 所以, 在数据层面上获取DOM更新后的属性的开发本身本不需要nextTick的参与.

> TIP: 上述例子不能使用debugger来中断, 因为debugger只中断JS引擎的执行, 而GUI渲染线程并不会中断! 必须使用alert才能中断GUI渲染线程. 如果使用debugger替换alert, 在断点处也能看到UI被重新渲染.


## 误区二: nextTick可将传入的回调函数推迟到一次事件循环后再执行
貌似很多同学的文字中存在这样的误区:(图)

#### nextTick实现方法
在Vue中, `nextTick`的实现原理, 在浏览器支持的情况下, 主要是基于尽量基于微任务实现的.
(Vue2.0中,经历了多次调整, 在微任务和宏任务中返回横跳, 具体的可以[这篇文章](https://juejin.cn/post/6875492931726376974). 而在Vue3.0中, 因为不存在兼容性问题了, 所以统一使用Promse实现.)

#### 微任务情况下nextTick的执行时机

我们上面已经提到, 微任务的执行时机是在DOM渲染之前的, 而且即使在微任务执行中又有新的微任务入列, JS线程也始终会将微任务队列清空, 然后才会执行后续的DOM渲染, 以及下一个事件循环. 还是按习惯我们再举个栗子: 

```
<!DOCTYPE html>
<html lang="en">
<body>
  <script>
    console.log('同步任务1')
    Promise.resolve().then(() => {
      console.log('微任务1');
      Promise.resolve().then(() => {
        console.log('微任务2');
        Promise.resolve().then(() => {
          console.log('微任务3');
        })
      })
    })
    setTimeout(() => {
      console.log('宏任务1');
    }, 0)
    console.log('同步任务2')
  </script>
  <script>
    // 一个script相当于一个新的宏任务, 这里用来模拟下一次事件循环
    console.log('下一个宏任务')
  </script>
</body>
</html>
```
运行结果:
...
可见, 无论我们怎么嵌套多少层, 微任务中添加的微任务, 都必定会在当前的事件循环中被执行. 只要nextTick是基于微任务方法实现的, 那就无法把其回调函数的代码推迟到下一个事件循环.

这也不是那也不是, 那Vue的nextTick到底是干嘛的?

## 手写nextTick执行示例

Vue官方文档中对于nextTick的[解释](https://cn.vuejs.org/guide/essentials/reactivity-fundamentals.html#dom-update-timing): 
```
当你更改响应式状态后，DOM 会自动更新。然而，你得注意 DOM 的更新并不是同步的。相反，Vue 将缓冲它们直到更新周期的 “下个时机” 以确保无论你进行了多少次状态更改，每个组件都只更新一次。
若要等待一个状态改变后的 DOM 更新完成，你可以使用 nextTick() 这个全局 API：
```
单看上面的文字可能有点费解, 先给出个可能比较好理解的结论: 因为Vue的响应式更新是异步的, 造成DOM更新更新也是异步的, 所以当需要精确获取异步的DOM更新时, 需要一个方法, 来把执行代码"拖慢"到跟异步响应式更新同一步伐上. 这个方法就是nextTick.

为了能从根源上搞清楚Vue的更新原理,  接下来我们尝试自行实现一个简单的vue实现, 逐步用自己代码来实现一个最小化的最简单的响应式更新过程. 以下面一个最简单的vue-sfc举例: 

```
// 以下实例主要参考[这篇文章](https://juejin.cn/post/7166517557124415518)
<template>
  <div @click="modify">{{name}}</div>
</template>
<script lang="ts" setup>
const name = ref('origin: name-1');
const modify = () => {
  name.value = 'before nextTick: name-2'; // 关键的赋值语句，如果注释掉，结果就大不一样了
  nextTick(() => {
    const text = document.querySelector<HTMLElement>(".name").innerText;
    console.log('当前Html内容: ', text);
  });
  name.value = 'after nextTick: name-3;
};
</script>
```

#### Step 1: 将vue-sfc改写成浏览器版本

我们都知道, vue的sfc文件是vue自己提供的语法糖, 需要预编译后才能在浏览器中运行, 编译流程通常需借助`webpack`+`vue-loder`实现. 为了能拜托依赖构建工具, 更清晰的展示核心内容, 所以第一步我们先将上述sfc文件转成等价的html代码. 参考霍大的《Vue.js设计与实现》，实现代码如下: 

```
<!DOCTYPE html>
<html lang="en">
<body>
  <div id="app"></div>
  <!-- vue.global.js是vue打包的能直接在现代浏览器中允许的版本 -->
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="module">
    // Vue的浏览器版本会将常用API暴露在全局变量Vue中, 可以自己引用不需import
    const { createApp, ref,h, nextTick  } = Vue
    const VueComp = {
      setup() {
        const name = ref('a');
        const handleClick = () => {
          name.value = 'b';
          nextTick(() => {
            const text = document.querySelector("#app").textContent;
            console.log(text);
          });
          name.value = 'c';
        }
        return {
          name,
        }
      },
      render(){
        return h('div', {onClick: () => handleClick() }, [name.value])
      }
    };
    const app = createApp(VueComp).mount('#app');
  </script>
</body>
</html>
```
以上代码与sfc文件等价, 其实主要做了两件事:
1. 将template模板替换为渲染函数;
2. 使用浏览器版的Vue(vue.global.js)替换构建工具版本;

不理解的同学可以去翻翻霍大的书.

#### Step 2: 自行实现更新流程

接下来我们尝试自行实现更新流程. 首先, 先来复习一下Vue的异步更新设计. 

Vue的响应式原理, 是在getter时收集依赖, 在setter时触发数据更新和重新渲染. 简单来说, 具体实现类似于常见"发布订阅模式", 在getter时, 每个数据项的背后都维护着一个"篮子"（用数组或Set实现）, 用来"订阅"回调, 保存相关的"突变函数", 然后在setter时依次触发这个"篮子"内的回调函数. 这种"突变函数", 在Vue2版本中叫watcher, 在Vue3版本中改为**effect**, 即**"副作用"函数**. 

那么Vue的响应式数据更新时, 触发的副作用函数做了什么事呢? 其实可简单理解为, Vue是在副作用函数中执行了render函数, 当响应式数据更新时, 触发重新执行render. 我们都知道, render函数是用来返回vnode(虚拟DOM)的, 所以
```
```

不过与一般的"发布订阅模式"不同, Vue的突变函数经常会需要触发视图的更新, 我们都知道,DOM的更新是比较耗时的, 假如多个副作用函数同时触发, 会导致DOM在短时间内密集更新, 这个对于大型应用来说是灾难性的. 

为了优化该流程, Vue会将一次事件循环中的全部副作用函数压入一个事件栈, 然后推迟到微任务阶段统一执行. 回顾上面提到的时间循环流程: 

`同步任务 > 微任务 > DOM渲染 > 宏任务`

因为微任务统一执行后DOM才会进行渲染, 所以通过这种方法, Vue能实现无论你进行了多少次状态同步更改，每个组件都只更新一次。

那么, 这个调度流程是怎么实现的呢? 其实很简单, 就是用一个队列来缓存effect函数, 然后使用Promise推迟到微任务阶段统一执行. 简化代码如下:

```
// 副作用函数的入参, 可以简单理解为Vue是将在副作用函数中执行了render函数, 当响应式数据更新时, 触发重新执行render,
const effectFn = () => {
  render(vnode(), document.querySelector('#app'))
};

// 调用副作用函数. effect第二个参数为options, options.scheduler为effect的调度函数, 当传入options.scheduler(调度函数)时, effectFn不会立刻执行, 而是调用该scehdular.

effect(effectFn, {
  scheduler: () => queueJob(effectFn),
});

// 创建一个缓存队列
const queue = new Set();
// 触发清理的flag, 避免重复执行;
let isFlushing = false;
// 入队函数
function queueJob(job) {
  queue.add(job);
  if (!isFlushing) {
    isFlushing = true;
    // 通过promise将队列任务的执行放到微任务队列
    Promise.resolve().then(() => {
      try {
        // 取出微任务队列, 逐个执行
        queue.forEach(job => job())
      } finally {
        // 微任务处理完成后重置flag
        isFlushing = false
      }
    })
  }
}
```
#### 手写一个Vue的异步更新


let setupResult = VueComp.setup();

effect(() => {
  setupResult();
})

## 误区三: nextTick偶尔失效的问题
## nextTick"失效"问题




https://juejin.cn/post/6875492931726376974



- 浏览器渲染时机问题
- nextTick的奇怪现象


参考: 
https://juejin.cn/post/7084989596034924581
https://juejin.cn/post/7166517557124415518

宏中有微，先微再宏
每一个宏任务都拥有自己的微任务队列，只有自己所有微任务都执行完毕的情况下，才会切换至下一个宏任务。