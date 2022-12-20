---
theme: vuepress
highlight: lioshi
---
## 背景

说来惭愧，笔者作为一名有好几年开发经验的高级前端，却一直对Vue的执行细节一知半解。 最近拜读霍大的《Vue.js设计与实现》，发现自己之前对vue事件流程和nextTick方法一直存在误解，而且就目前从网上看到的关于nextTick的讨论，貌似有类似误解的同学还不少。 所以趁现在还有印象，赶紧记录一下，也希望能给有类似困惑的同学有所启发。

> 《Vue.js设计与实现》是一本难得的好书，豆瓣评分9.5, 推荐每个Vuer都看看!
>

为了方便讲解，本文先澄清几个nextTick误区，然后自己尝试手动"肢解"一个最小化的Vue demo，转化成原生JS代码，以辅助理解。


## 误区一：❌ nextTick是用于获取DOM渲染完成后的最终属性

Vue官方文档中，对于nextTick有如下一句[解释](https://cn.vuejs.org/guide/essentials/reactivity-fundamentals.html#dom-update-timing)：
```
若要等待一个状态改变后的 DOM 更新完成，你可以使用 nextTick() 这个全局 API：
```
如果不看上下文，对此容易产生一个误会：nextTick是用于获取dom更新后的DOM属性。 那实际情况真是如此吗?

首先，对dom的更新有所了解的同学应该知道，在JS线程的一次事件循环的更新流程如下：

`同步任务` > `微任务` > `DOM渲染` > `宏任务(下一次事件循环)`

然而，一个容易混淆的概念是，上述的"DOM渲染"实际指的是浏览器的GUI渲染进程，实际上**DOM操作本身其实是同步的，其属性可以直接在下一行获得，并不需要等待DOM渲染完成才能获取属性**。 

我们先写个实践代码测试一下：

```html
<!DOCTYPE html>
<html lang="en">
<body>
  <button>change</button>
  <script>
    document.querySelector('button')。onclick = function(){
       // 同步任务
      document.body.style = 'background: blue';
      console.log('同步任务: 当前背景色: ', document.body.style.background);
      alert('同步任务: 当前背景色: ' + document.body.style.background);
      // 微任务
      Promise.resolve().then(() => {
        document.body.style = 'background: green';
        console.log('微任务: 当前背景色: ', document.body.style.background);
        alert('微任务: 当前背景色: ' + document.body.style.background);
      });
      // 宏任务
      setTimeout(() => {
        document.body.style = 'background: red';
        console.log('宏任务: 当前背景色: ', document.body.style.background);
        alert('宏任务: 当前背景色: ' + document.body.style.background);
      }, 0)
    }
  </script>
</body>
</html>
```

在浏览器运行上述html代码，使用alert中断渲染进程，效果如下：

![background-demo.gif](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/39f09d30639342349d59f91666af6399~tplv-k3u1fbpfcp-watermark.image?)

观察上述Deom的运行效果，修改DOM背景色时，同步任务和微任务的背景色并不会立刻渲染，而是会集中到宏任务执行之前，body的背景色才会渲染出来; 而宏任务的背景色则会立刻渲染(因为已经进入了下一个事件循环了). 这个符合上述`同步任务 > 微任务 > DOM渲染 > 宏任务`的预期。 但是不管同步任务、微任务、宏任务，alert中断执行时，控制台都能正确打印出当前背景色的值：

![background-demo-1.jpg](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/03dc612ee4594958ac54260d5be810e0~tplv-k3u1fbpfcp-watermark.image?)

![background-demo-2.jpg](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6ca833b763524ce7a25ef803d55e19ec~tplv-k3u1fbpfcp-watermark.image?)

事实上，**浏览器的对待页面的正确“姿势”是先计算后渲染。 即使在同一个事件循环中，DOM操作本身也是同步的，只是DOM渲染会推迟到一次事件循环的最后再执行**。

在本质上，DOM也只是一个对象而已，在修改DOM对象时，UI的修改（包括添加节点、修改颜色、修改节点内容等）会立即更新应用程序的状态，然后等到微任务队列清空后，事件循环会检查当前是否需要重新渲染UI，如果需要则渲染UI视图。 所以**在数据层面上，你的下一行代码就可以拿到DOM的修改结果，在数据层面上获取DOM更新后的属性并不需要nextTick的参与。**

> 上述Demo为方便演示，更新方式使用了background，只涉及重绘(repaint); 不过笔者实测重排(reflow)的效果也是一样，有兴趣的同学可以自行测试。 

> 题外话：上述例子不能使用debugger来中断，因为debugger只中断JS引擎的执行，而GUI渲染线程并不会中断。 必须使用alert才能中断GUI渲染线程。 如果使用debugger替换alert，在断点处也能看到UI被重新渲染。


## 误区二：❌ nextTick可将传入的回调函数推迟到一次事件循环后再执行

这貌似是个比较普遍的误区。 在网上搜索nextTick相关文章，时不时会看到这样的表述：

![screenshot-20221219-102257.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/7db1e80095394dd8891c6be330824c13~tplv-k3u1fbpfcp-watermark.image?)


![20221219-103803.jpg](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/7e7a0175b49a4680bc5e577c692b5a13~tplv-k3u1fbpfcp-watermark.image?)

那么实际情况又是如何?

### nextTick实现方法
在Vue中，`nextTick`的实现原理，在浏览器支持的情况下，基本上是尽量基于微任务实现的。 Vue2.0中nexTick经历了多次调整，在微任务和宏任务中反复横跳，但优先考虑微任务; 而在Vue3.0中，因为不存在兼容性问题了，所以统一使用Promse实现，简化代码如下：

```javascript
// Vue3.0中的nextTick
function nextTick(fn) {
  return Promse.resolve().then(fn);
}
```

> Vue2的nextTick实现的变化可以看看[这篇文章](https://juejin.cn/post/6875492931726376974)。 

### 微任务情况下nextTick的执行时机

在上面**误区一**已经提到，微任务的执行时机是在DOM渲染之前的，所以nextTick理论上是无法将代码加入下一个事件循环的。 有同学可能会问：如果微任务中又产生了新的微任务，那执行顺序会是怎么样呢? 是在当前事件循环继续执行，还是将新的微任务放到下一个事件循环的微任务队列呢？

还是老习惯，我们尽量使用栗子来验证：

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
运行结果：


![screenshot-20221219-105303.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/52a3e240b1634826ad70084a0b3183d9~tplv-k3u1fbpfcp-watermark.image?)

查看控制台的打印结果可知，无论我们嵌套多少层，微任务中添加的微任务，都必定会在当前的事件循环中被执行。 即使在微任务执行中又有新的微任务入列，JS线程也始终会将微任务队列清空，然后才会执行后续的DOM渲染，以及下一个事件循环。 所以**只要nextTick是基于微任务方法实现的，那就无法把其回调函数的代码推迟到下一个事件循环!**

这也不是那也不是，那么nextTick到底是干嘛用的?


## "拆解"nextTick和Vue事件流程

Vue官方文档中对于nextTick的[解释](https://cn.vuejs.org/guide/essentials/reactivity-fundamentals.html#dom-update-timing)：

![screenshot-20221219-110746.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9346869583e74a4c8533cb9cc123abf6~tplv-k3u1fbpfcp-watermark.image?)

看上面的解释，大概能猜到，nextTick应该是跟Vue的事件流程处理相关的。 我们来看看下面这个简单的Demo：(**该SFC下文简称为"示例SFC"**)

```html
// 示例SFC代码
<template>
  <div @click="modify">{{name}}</div>
</template>
<script lang="ts" setup>
import {ref, nextTick} from 'vue';
const name = ref("111");
const modify = () => {
  name.value = "222";
  nextTick(() => {
    const text = document.querySelector("div").innerText;
    console.log(text);
  });
  name.value = "333";
};
</script>
```

这个是在vue中执行上述代码，并进行细微调整，可以发现：
1. 直接执行上述代码([Demo](https://sfc.vuejs.org/#eNp9UctugzAQ/JXVXkKkxCjJLSWo/Ybm6AuFJSXFj9qGNkL8e9eQVlEq5YAAz+zM7HjAF2tF3xHuMQukbFsEyqUGyKqmh+eybcqPg0Rlqqa+SMyHQReKxjFLGWdilt5MZb50jQ3QFvrEQ8FLBE+hs4w1yhoXYHBUr0DTdziy8gi1MwoWHGDxJHVptA8QDeAATEwkbjYbics/bM7BaLKEQw5DTBr5oi/aLk5J3G63EnmAgatLckMGmIUCY0yvTNkp0kF8duQur9RSGYxjX96OfUWjNbkjcyfBedi0JFpzSqJETAYwzq+7ILvdbgoy8pOlczU5rnBuYq0KK87eaG5+SiavAJe2/80qkZuJ/xLfQ7B+n6a+LuN9nb0w7pTyl3CdDg07k1frN2e+PDkWlri60Uj5sCe3dqQrcuQead5R/+lOG/NaOP4A4GbCpg==))并点击div，控制台将打印出：`333` ;
2. 去掉nextTick函数，执行代码([Demo](https://sfc.vuejs.org/#eNp9UUtugzAQvcpoNk2kxFaSXUpQe4Zm6Q2FISXFn9qGNkLcvWNooyiVukAyvK8fAz47J/qOcI9ZJO3aIlKuDEBWNT08lW1Tvh8Uals19UVhPgym0DSOmWSciZm8UWWh9I2L0BbmxKIYFEKg2DnGGu2sjzB4qldg6Cse2XmE2lsND1zg4VGZ0poQIQXAAZi4ULjZbBQur9jcg9HFEg45DKlp4ou+aLukUrjdbhWyAEDKa9Dihg8we0XGWFHZstNkovjoyF9eqKUyWs/RfEGOFo0x5I/MnTxnsW1JtPa0SBap3JQ1zqe7Orvdbqoz8pPJeaAcVzjvsdaFE+dgDe8/lVM/AE+3/62rkPdJ7wrfYnRhL2Woy/TXzkFYf5J8Er4zseFkCnr96u1nIM/GClc3HpI/9uTXnkxFnvx/nnfUP77JduRr4fgNNQLDog==))并点击div，控制台将打印出：`111`;
3. 保留nextTick，注释掉`name.value = "222";`，执行代码([Demo](https://sfc.vuejs.org/#eNp9UUtugzAQvcpoNiFSYivJLiWoPUOz9IbCkJLiT21DGyHu3gHaKEqlLBDg95k3zz2+OCe6lnCPaSTtmjxSpgxAWtYdPBdNXXwcFGpb1tVFYdb3Jtc0DKlknImpvFGlofC1i9Dk5sSiGBRCoNg6xmrtrI/Qe6pWYOg7Htl5gMpbDQsOsHhSprAmRBgHwAGYmCjcbDYKl1dszsFosoRDBv2YVMpJIrq8aUehwu12q5A1cB2U3PABZq/IGNNLW7SaTBSfLfnLKzVUROt5NC/Io0VtDPkjcyfDWWwbEo09JaPFGA5gmF93QXa73RRk4CeVczsZrnAuY61zJ87BGi5/SqZ+Ae5t/5dVIZcz/it8j9GFvZShKsYrOwdh/Unyl/CtiTVPpqDXb95+BfJsrHB14yH5sCO/9mRK8uQfed5R//lOG/NaOPwAZQHDJA==))并点击div，控制台将打印出：`111`;


> 上述第3个调整的Demo的结果可能令人意外，可能部分同学会预期控制台将打印出`333`，但实际上打印出来的却是`111`，其实这个Demo刚好**证明了上文误区二的错误**，因为如果nextTick作用是将代码推迟到下一个事件循环，那打印出来就应该是`333`! 
> 
> 这个实例参考自[这篇文章](https://juejin.cn/post/7166517557124415518)，大家可以看看
> 
> ![11](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8f56a95cdd4949b0a111f51f7fdcbec4~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp?)

从上述`示例SFC`，我们发现nextTick确实是会对事件流程的执行结果有影响。为了能从根源上搞清楚Vue的更新原理，接下来我们尝试将这个`示例SFC`拆解为原生JS代码，逐步用自己代码来实现一个最小化的最简单的响应式更新过程。 

### Step 1: 将vue-sfc改写成浏览器版本

我们都知道，vue的sfc文件是vue自己提供的语法糖，需要预编译后才能在浏览器中运行，通常借助`webpack`+`vue-loder`实现。 为了能摆脱对构建工具的依赖，第一步我们先将上述`示例SFC`转成等价的html代码。 参考霍大的`《Vue.js设计与实现》`，等价代码如下：

```
<!DOCTYPE html>
<html lang="en">
<body>
  <div id="app"></div>
  <!-- vue.global.js是vue打包的能直接在现代浏览器中允许的版本 -->
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="module">
    // Vue的浏览器版本会将常用API暴露在全局变量Vue中
    const { createApp, ref,h, nextTick  } = Vue
    const VueComp = {
      setup() {
        const name = ref('111');
        const handleClick = () => {
          name.value = '222';
          nextTick(() => {
            const text = document.querySelector("#app").textContent;
            console.log('当前Html内容: ', text);
          });
          name.value = '333';
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

以上代码与`示例SFC`等价，其实主要做了两件事：
1. 将template模板替换为渲染函数;
2. 使用浏览器版的Vue(vue.global.js)替换构建工具版本;

### Step 2: 自行触发响应式更新

接下来我们尝试自行实现更新流程。 首先，复习一下Vue的异步更新设计。 

Vue的响应式原理，是在getter时收集依赖，在setter时触发数据更新和重新渲染。 简单来说，具体实现类似于常见"发布订阅模式"，在getter时，每个数据项的背后都维护着一个"篮子"（用数组或Set实现），用来"订阅"回调，保存相关的"突变函数"，然后在setter时依次触发这个"篮子"内的回调函数。 这种"突变函数"，在Vue2版本中叫watcher，在Vue3版本中改为**effect**，即**副作用函数**。 

![v2-1020ec2076241273a25a4a6d44705ab6_1440w (1).webp](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/327ef016f5e3431ca25f2070d9dd262c~tplv-k3u1fbpfcp-watermark.image?)

Vue3.0中的effect函数的作用，可以简单理解为：当副作用函数"包裹"的"响应式数据"发生写值(setting)操作时，该effect函数包裹的callback将会重新调用：
```
let reactiveVal = ref('a'); // reactiveVal是个响应式数据
effect(function callback(){
    // callback中的响应式数据发生变化时, effect包裹的cb函数将重新执行。
    reactiveVal.value = 'b'; 
})
```

而**Vue的模板更新，实际上是在副作用函数中执行了render函数，所以当响应式数据更新时，触发重新执行render。 我们都知道，render函数是用来返回vnode(虚拟DOM)树的，重新执行render就会生产新的vnode树，这样我们就拿到了新旧两棵vnode树了，然后就可以进行patch算法，进而触发dom更新了**。

所以现在我们可以将Step1生成的代码进一步转换为：

```
<!DOCTYPE html>
<html lang="en">
<body>
  <div id="app"></div>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="module">
    const { createApp, ref,h, nextTick, render, effect  } = Vue;
    const renderDOM = render; // 起个别名以方便跟render函数区分
    const VueComp = {
      setup() {
        const name = ref('111');
        const handleClick = () => {
          name.value = '222';
          nextTick(() => {
            const text = document.querySelector("#app").textContent;
            console.log('当前Html内容: ', text);
          });
          name.value = '333';
        }
        return {
          name,
          handleClick,
        }
      },
      render(){
        return h('div', {onClick: () => this.handleClick() }, [this.name.value])
      }
    };
    // 执行一次setup, 获得setup返回的响应式数据. 整个生命周期setup只会执行一次
    const setupResult = VueComp.setup();
    
    const effectFn = () => {
       // 将setupResult返回的数据bind到render函数中, 使render函数中可以使用this.xxx引用setup返回的数据
       const subTree = VueComp.render.call(setupResult);
       renderDOM(subTree, document.querySelector('#app'));
    }
    // effect包裹DOM更新数据, 其中包裹的callback函数包含的setupResult数据更新时, callback函数将重新执行
    effect(effectFn)
  </script>
</body>
</html>
```
上述代码执行效果跟`示例SFC`等价。

### step3: 加入异步更新机制

经过上一步代码，我们似乎已经实现了响应式，然而，与一般的"发布订阅模式"不同，Vue的突变函数经常会需要触发视图的更新。 假如在一次事件循环中多个effect函数同时触发，将导致触发多次DOM的密集更新需求，即使有patch算法进行突变的合并，对于大型应用来说也很可能会产生性能问题。 

为了优化该流程，Vue会将一次事件循环中的全部副作用函数压入一个事件栈，然后推迟到微任务阶段统一执行。 回顾上面提到的时间循环流程：

`同步任务 > 微任务 > DOM渲染 > 宏任务`

因为微任务统一执行后DOM才会进行渲染，所以通过这种方法，Vue能实现在一次事件循环中无论你进行了多少次状态同步更改，每个组件都只更新一次。

那么，这个调度流程是怎么实现的呢? 事实上，Vue的effect函数支持第二个可选参数options，这是一个对象，包含以下可选属性：

![20221219-142259.jpg](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9c3b572e697f44c3921664982087b135~tplv-k3u1fbpfcp-watermark.image?)

其他属性暂时不考虑，我们只看scheduler这个属性，从类型定义可知，这个是通用的函数类型：

![20221219-142735.jpg](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6769c5b1d71c46ca8f2c8787076d3a82~tplv-k3u1fbpfcp-watermark.image?)

这个函数的作用是用来控制effect的执行时机，当有传入options.scheduler时，effect被触发时并不是执行第一参数的callback函数，而是执行该scheduler来替代。 所以我们**可以使用该options.scheduler来修改副作用的执行时机**。 具体到我们当前的需求，就是**用一个队列来缓存effect函数，然后使用Promise推迟到微任务阶段统一执行**。 

简化代码如下：
```
<!DOCTYPE html>
<html lang="en">
<body>
  <div id="app"></div>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script type="module">
    const { createApp, ref, h, nextTick, render, effect } = Vue;
    const renderDOM = render; // 起个别名以方便跟render函数区分
    const VueComp = {
      setup() {
        const name = ref('111');
        const handleClick = () => {
          name.value = '222';
          nextTick(() => {
            const text = document.querySelector("#app").textContent;
            console.log('当前Html内容: ', text);
          });
          name.value = '333';
        }
        return {
          name,
          handleClick,
        }
      },
      render() {
        return h('div', { onClick: () => this.handleClick() }, [this.name.value])
      }
    };
    // 执行一次setup, 获得setup返回的响应式数据. 整个生命周期setup只会执行一次
    const setupResult = VueComp.setup();

    const effectFn = () => {
      // 将setupResult返回的数据bind到render函数中, 使render函数中可以使用this.xxx引用setup返回的数据
      const subTree = VueComp.render.call(setupResult);
      renderDOM(subTree, document.querySelector('#app'));
    }

    // 调用副作用函数. effect第二个参数为options, options.scheduler为effect的调度函数, 
    // 将副作用相关函数effectFn传入queueJob函数来实现延迟执行
    effect(effectFn, {
      scheduler: () => queueJob(effectFn),
    });

    // 创建一个缓存队列
    const queue = new Set();
    // 是否触发清理的flag, 避免重复执行;
    let isFlushing = false;
    // 延迟执行的入队函数
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
  </script>
</body>
</html>
```
到了这里，我们就完成了对`示例SFC`的事件流程的手动实现。 在浏览器中直接运行，以及分别去掉`nextTick`和`name.value = "222";`，执行结果都与原代码一致。

### Step 4: 原生JS实现的粗糙版本

最后，考虑到有些同学可能对Vue的effect机制不太了解，我们还可以进一步简化掉所有Vue相关的内容，以及vnode等其他我们这个示例不关注的内容，用原生JS实现一个粗糙的版本：
```
<!DOCTYPE html>
<html lang="en">
<body> 
  <div id="app"></div>
  <script>
    const appEl = document.querySelector('#app');
    appEl.innerHTML = '111'; // 初始值111
    
    appEl.addEventListener('click', () => {
      const queue = new Set()
      let isFlushing = false
      function queueJob(job) {
        queue.add(job)
        if (!isFlushing) {
          isFlushing = true
          Promise.resolve().then(() => {
            try {
              queue.forEach(job => job())
            } finally {
              isFlushing = false
            }
          })
        }
      }
     
      /*
      nextTick前赋值为222, 此时queue = []
      */ 
      queueJob(() => {
        appEl.innerHTML = '222';
      });
      /*****
      此时queue = [
          () => {appEl.innerHTML = '222'}
      ]
      *****/ 
      // nextTick使用Promse.resove().then()实现
      Promise.resolve().then(() => {
        // nextTick中打印出当前HTML内容
        const text = appEl.textContent;
        console.log('当前Html内容: ', text);  // log: '当前Html内容: 333'
      })
      /*****
      此时queue = [
          () => {appEl.innerHTML = '222'}
          () => {appEl.innerHTML = '333'}
      ]
      *****/ 
      // nextTick后赋值为333
      queueJob(() => {
        appEl.innerHTML = '333';
      });
    })
  </script>
</body>
</html>
```
至此，我们便实现了用原生JS实现的Vue事件流程。上述代码应该大家都看得懂了，大家可以复制到浏览器中执行试试，执行结果都与原代码一致。 

从上面的代码我们可以看出，**因为Vue副作用事件放在Promise-then里执行了，为了能获取到更新后的DOM信息，我们需要把相关代码"拖慢一点"执行，所以也放到Promse-then中执行，大家都同属微任务，保证统一步伐，避免执行顺序错乱。** nextTick的作用仅此而已。


![cover.jpg](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d0c77af9b69e40de9695b1647475e7b1~tplv-k3u1fbpfcp-watermark.image?)

## 大概可以下结论了

经过上述洋洋洒洒几千字的分析，我们现在可以下结论了。

1. Vue的事件流程并不神秘，只是简单的将一次事件循环中，响应式数据突变引起的副作用函数存储到一个微任务队列中，然后在事件循环的微任务处理阶段依次执行，最后触发DOM渲染。 

2. nextTick并不是用于获取DOM渲染完成后的最终属性的。 **因为Vue的响应式更新延迟，造成DOM的更新也是延迟的，当需要在代码中精确获取异步的DOM更新时，需要一个方法，来把执行代码"拖慢"到跟异步响应式更新同一步伐上。** 从这个角度来看，nextTick可以认为是为了vue事件延迟更新的一个"补丁"，如果没有涉及在同一个事件循环里进行多次数据更新，基本不需要使用nextTick。

3. nextTick也不是用来把代码推迟到下一次事件循环的，因为基于微任务实现的nextTick根本做不到这一点。 实践中如果确实需要推迟代码到下一个事件循环再执行，可以考虑自己用`setTimeout(fn, 0)`等宏任务方式实现。

4. nextTick只能对发生在它"前面"的数据变化做出响应，而不能对发生在它"后面"的数据变化做出响应，这个是符合预期的，并非bug。


#### 参考：
- [《Vue.js设计与实现》](https://book.douban.com/subject/35768338/)
- [神奇的nextTick一定能获取到最新的dom么？](https://juejin.cn/post/7166517557124415518)
- [Vue的nextTick具体是微任务还是宏任务?](https://juejin.cn/post/6875492931726376974)
- [JS宏任务，微任务，DOM渲染，requestAnimationFrame执行顺序比较](https://juejin.cn/post/7084989596034924581)
- [聊聊Vue2/3的响应式系统的异同](https://zhuanlan.zhihu.com/p/460286808)
- [通俗易懂的Vue异步更新策略及 nextTick 原理](https://juejin.cn/post/6844904169967452174)
