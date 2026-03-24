// app.js - 北京花粉监测网页版
// 数据来源：中国天气网 & 首都医科大学附属北京同仁医院

const API_BASE = 'https://graph.weatherdt.com/ty/pollen/v2/hfindex.html';

// ===== 工具函数 =====

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTime(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

function getLevelInfo(levelCode) {
  const levels = {
    '-1': { text: '暂无',  color: '#6b7c6e', icon: '🌿', advice: '暂无花粉数据' },
     '0': { text: '未检测', color: '#5a7265', icon: '🌿', advice: '暂无花粉数据' },
     '1': { text: '很低',  color: '#405A44', icon: '😊', advice: '花粉浓度很低，可正常外出活动' },
     '2': { text: '低',   color: '#4A8453', icon: '🙂', advice: '花粉浓度较低，过敏体质适当防护' },
     '3': { text: '中',   color: '#9AD871', icon: '😐', advice: '花粉浓度中等，建议佩戴口罩，对症用药' },
     '4': { text: '高',   color: '#FFF86F', icon: '😷', advice: '花粉浓度高，加强防护，规范用药' },
     '5': { text: '很高',  color: '#FFD400', icon: '⚠️', advice: '花粉浓度极高，减少外出，持续规范用药' },
  };
  return levels[String(levelCode)] || levels['0'];
}

// ===== 数据获取 =====

async function fetchPollenData(days = 21) {
  const today = new Date();
  const end = formatDate(new Date(today.getTime() + 3 * 86400000)); // 多取3天预报
  const start = formatDate(new Date(today.getTime() - (days - 1) * 86400000));
  const url = `${API_BASE}?eletype=1&city=beijing&start=${start}&end=${end}&predictFlag=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();

  // 兼容 JSONP 和纯 JSON
  let data;
  const match = raw.match(/^[^(]+\((.+)\)$/s);
  data = JSON.parse(match ? match[1] : raw);

  if (!data || !data.dataList) throw new Error('数据格式异常');
  return data;
}

function processData(raw) {
  const todayStr = formatDate(new Date());

  const dataList = raw.dataList
    .map(item => {
      const code = (item.levelCode !== undefined && item.levelCode !== null) ? item.levelCode : -1;
      const info = getLevelInfo(code);
      // isPredict: 日期 > 今天 视为预报（未来预测），日期 <= 今天 视为历史/实测
      const isPredict = item.addTime > todayStr;
      return {
        date: item.addTime,
        dateShort: item.addTime.slice(5),
        week: item.week,
        weekShort: item.week.replace('星期', ''),
        level: item.level || '暂无',
        levelCode: code,
        levelMsg: item.levelMsg || '',
        color: info.color,  // 强制使用自定义颜色，忽略API返回的颜色
        isPredict,
        info,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // 优先取今天有效数据；若今天无有效数据，取最近一条历史有效数据（日期<=今天且levelCode>=0）
  const todayData = dataList.find(d => d.date === todayStr);
  const latestValid = dataList.find(d => !d.isPredict && d.levelCode >= 0);
  const today = (todayData && todayData.levelCode >= 0) ? todayData : (latestValid || dataList[0]);
  
  // 标记是否显示的是历史数据（而非今天的数据）
  const isHistoricalData = !todayData || todayData.levelCode < 0;

  // 等级说明列表：替换API颜色为自定义颜色
  const levelNameMap = { '很低': '1', '低': '2', '中': '3', '高': '4', '很高': '5', '未检测到花粉': '0' };
  const seasonLevel = (raw.seasonLevel || []).map(sl => {
    const code = levelNameMap[sl.level];
    const info = code !== undefined ? getLevelInfo(Number(code)) : null;
    return { ...sl, color: info ? info.color : sl.color };
  });

  return {
    dataList,
    seasonLevel,
    seasonLevelName: raw.seasonLevelName || '',
    today,
    isHistoricalData,
    updateTime: formatDateTime(new Date()),
  };
}

// ===== 全局状态 =====
let state = null;
let selectedBarIndex = -1;

// ===== 渲染函数 =====

function renderHome(data) {
  const today = data.today;
  const info = today.info;

  // 英雄卡片：固定深绿色背景，用等级颜色做顶部色条
  const hero = document.getElementById('hero-card');
  hero.style.background = '';  // 使用 CSS 默认深绿色背景
  hero.style.setProperty('--level-color', info.color);
  hero.style.borderTop = '';  // 使用 CSS 默认边框，不显示等级色条

  document.getElementById('season-badge').textContent = data.seasonLevelName || '春季';
  document.getElementById('update-time').textContent = '更新于 ' + data.updateTime;
  document.getElementById('hero-icon').textContent = info.icon;
  document.getElementById('hero-level').textContent = today.level;
  
  // 如果显示的是历史数据，添加提示
  const dateText = data.isHistoricalData ? `${today.date} ${today.week} (最新数据)` : `${today.date} ${today.week}`;
  document.getElementById('hero-date').textContent = dateText;
  
  // 如果今天数据还没更新，在提示信息中说明
  const msgText = data.isHistoricalData 
    ? today.levelMsg || info.advice + '\n💡 提示：今日数据暂未更新，显示最近一天的数据'
    : today.levelMsg || info.advice;
  document.getElementById('hero-msg').textContent = msgText;

  // 等级条
  const bar = document.getElementById('level-bar');
  bar.innerHTML = '';
  data.seasonLevel.forEach(sl => {
    if (sl.level === '未检测到花粉') return;
    const el = document.createElement('div');
    el.className = 'level-bar-item' + (sl.level === today.level ? ' active' : '');
    el.innerHTML = `<span class="level-dot" style="background:${sl.color}"></span>${sl.level}`;
    bar.appendChild(el);
  });

  // 近7天
  const weekList = document.getElementById('week-list');
  weekList.innerHTML = '';
  // 取最近7条有效实测数据（levelCode >= 0）
  const week7 = data.dataList.filter(d => !d.isPredict && d.levelCode >= 0).slice(0, 7);
  week7.forEach(d => {
    const el = document.createElement('div');
    el.className = 'week-item' + (d.date === today.date ? ' today' : '');
    el.innerHTML = `
      <span class="week-date">${d.dateShort}</span>
      <span class="week-week">${d.weekShort}</span>
      <span class="week-dot" style="background:${d.color}"></span>
      <span class="week-level" style="color:${d.color}">${d.level}</span>
    `;
    weekList.appendChild(el);
  });
}

function renderTrend(data) {
  // 取最近14条有效实测数据（levelCode >= 0）
  const chartData = data.dataList.filter(d => !d.isPredict && d.levelCode >= 0).slice(0, 14).reverse();
  selectedBarIndex = chartData.length - 1;

  // 统计
  document.getElementById('stat-very-high').textContent = chartData.filter(d => d.levelCode >= 5).length;
  document.getElementById('stat-high').textContent = chartData.filter(d => d.levelCode === 4).length;
  document.getElementById('stat-mid').textContent = chartData.filter(d => d.levelCode === 3).length;
  document.getElementById('stat-low').textContent = chartData.filter(d => d.levelCode <= 2 && d.levelCode > 0).length;

  // 柱状图
  const barsEl = document.getElementById('chart-bars');
  barsEl.innerHTML = '';
  const maxCode = 5;

  chartData.forEach((d, i) => {
    const heightPct = Math.max(4, (Math.max(0, d.levelCode) / maxCode) * 100);
    const isSelected = i === selectedBarIndex;
    const col = document.createElement('div');
    col.className = 'bar-col';
    // 所有柱子都用等级原色，选中柱加白色顶部指示器
    const barOpacity = isSelected ? '1' : '0.35';
    const labelColor = isSelected ? '#ffffff' : '#4e7259';
    const labelWeight = isSelected ? '700' : '400';
    col.innerHTML = `
      <div class="bar-selected-dot ${isSelected ? '' : 'hidden'}"></div>
      <div class="bar-rect ${isSelected ? 'selected' : ''}"
           style="height:${heightPct}%; background:${d.color}; opacity:${barOpacity};"
           data-index="${i}">
      </div>
      <div class="bar-label" style="color:${labelColor};font-weight:${labelWeight}">${d.date.slice(8)}</div>
    `;
    col.addEventListener('click', () => selectBar(chartData, i));
    barsEl.appendChild(col);
  });

  // 图例
  const legendEl = document.getElementById('chart-legend');
  legendEl.innerHTML = '';
  data.seasonLevel.forEach(sl => {
    if (sl.level === '未检测到花粉') return;
    const el = document.createElement('div');
    el.className = 'legend-item';
    el.innerHTML = `<span class="legend-dot" style="background:${sl.color}"></span>${sl.level}`;
    legendEl.appendChild(el);
  });

  // 默认选中最后一条，并滚动到最右边让选中柱可见
  updateSelectedDetail(chartData[selectedBarIndex]);
  requestAnimationFrame(() => {
    const wrap = document.querySelector('.chart-bars-wrap');
    if (wrap) wrap.scrollLeft = wrap.scrollWidth;
  });
}

function selectBar(chartData, index) {
  selectedBarIndex = index;
  // 更新柱子样式和标签颜色
  document.querySelectorAll('.bar-col').forEach((col, i) => {
    const rect = col.querySelector('.bar-rect');
    const label = col.querySelector('.bar-label');
    const dot = col.querySelector('.bar-selected-dot');
    const isSelected = i === index;
    rect.classList.toggle('selected', isSelected);
    rect.style.opacity = isSelected ? '1' : '0.35';
    if (dot) dot.classList.toggle('hidden', !isSelected);
    label.style.color = isSelected ? '#ffffff' : '#4e7259';
    label.style.fontWeight = isSelected ? '700' : '400';
  });
  updateSelectedDetail(chartData[index]);
}

function updateSelectedDetail(d) {
  document.getElementById('sel-date').textContent = d.date;
  document.getElementById('sel-week').textContent = d.week;
  document.getElementById('sel-icon').textContent = d.info.icon;
  document.getElementById('sel-level').textContent = d.level;
  document.getElementById('sel-level').style.color = d.color;
  document.getElementById('sel-msg').textContent = d.levelMsg || d.info.advice;
  const predictEl = document.getElementById('sel-predict');
  d.isPredict ? predictEl.classList.remove('hidden') : predictEl.classList.add('hidden');
}

function renderForecast(data) {
  // 预报列表
  // 预报：isPredict=true 且日期 >= 今天，排除 levelCode=-1 的暂无条目（若有实际预报值则显示）
  const todayStr2 = formatDate(new Date());
  const forecastList = data.dataList.filter(d => d.isPredict && d.date >= todayStr2 && d.levelCode >= 0);
  const fcEl = document.getElementById('forecast-list');
  if (forecastList.length === 0) {
    fcEl.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px 0">暂无未来预报数据，通常每日早8时更新</p>';
  } else {
    fcEl.innerHTML = forecastList.map(d => `
      <div class="forecast-item" style="border-left-color:${d.color}">
        <div class="fc-left">
          <span class="fc-date">${d.date}</span>
          <span class="fc-week">${d.week}</span>
        </div>
        <div class="fc-right">
          <span class="fc-icon">${d.info.icon}</span>
          <div>
            <div class="fc-level" style="color:${d.color}">${d.level}</div>
            <div class="fc-msg">${d.levelMsg}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // 历史实况
  const historyList = data.dataList.filter(d => !d.isPredict && d.levelCode >= 0).slice(0, 7);
  const histEl = document.getElementById('history-list');
  histEl.innerHTML = historyList.map(d => `
    <div class="history-item">
      <div class="hist-date">
        <div class="hist-date-main">${d.dateShort}</div>
        <div class="hist-date-week">${d.weekShort}</div>
      </div>
      <div class="hist-bar-wrap">
        <div class="hist-bar" style="width:${Math.max(4, d.levelCode / 5 * 100)}%; background:${d.color}"></div>
      </div>
      <div class="hist-level" style="color:${d.color}">${d.level}</div>
    </div>
  `).join('');
}

// ===== Tab 切换 =====

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  // 切换到趋势Tab时重新渲染柱状图，避免hidden元素CSS transition导致颜色异常
  if (tabName === 'trend' && state) {
    renderTrend(state);
  }
}

// ===== 主入口 =====

async function loadData() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('error').classList.add('hidden');
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

  try {
    const raw = await fetchPollenData(21);
    state = processData(raw);

    renderHome(state);
    renderTrend(state);
    renderForecast(state);

    document.getElementById('loading').classList.add('hidden');
    switchTab('home');
  } catch (e) {
    console.error(e);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error-msg').textContent = '数据加载失败：' + e.message;
  }
}

// ===== 事件绑定 =====

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    switchTab(el.dataset.tab);
  });
});

// 启动
loadData();
